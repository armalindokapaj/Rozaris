import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { Prisma } from "@/generated/prisma";
import { ALLOWED_PARENT_TYPES } from "@/lib/locationHierarchy";

const geoJsonGeometrySchema = z
  .object({
    type: z.enum(["Polygon", "MultiPolygon"]),
    coordinates: z.array(z.any()),
  })
  .passthrough();

const patchSchema = z.object({
  officialName: z.string().min(1).optional(),
  parentId: z.string().min(1).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  boundaryGeometry: geoJsonGeometrySchema.nullable().optional(),
});

async function isDescendantOf(candidateParentId: string, targetId: string): Promise<boolean> {
  let cursor: string | null = candidateParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === targetId) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const row: { parentId: string | null } | null = await prisma.location.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = row?.parentId ?? null;
  }
  return false;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { locationId } = await params;
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) {
    return NextResponse.json({ error: "Location not found." }, { status: 404 });
  }
  return NextResponse.json(location);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { locationId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.location.findUnique({ where: { id: locationId } });
  if (!existing) {
    return NextResponse.json({ error: "Location not found." }, { status: 404 });
  }

  const { parentId, boundaryGeometry, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };

  if (boundaryGeometry !== undefined) {
    data.boundaryGeometry = boundaryGeometry === null ? Prisma.DbNull : boundaryGeometry;
  }

  if (parentId !== undefined) {
    if (parentId === locationId) {
      return NextResponse.json({ error: "A location can't be its own parent." }, { status: 400 });
    }
    const allowedParentTypes = ALLOWED_PARENT_TYPES[existing.type];
    if (allowedParentTypes.length === 0 && parentId) {
      return NextResponse.json(
        { error: `A "${existing.type}" location must be top-level (no parent).` },
        { status: 400 }
      );
    }
    if (allowedParentTypes.length > 0 && !parentId) {
      return NextResponse.json(
        { error: `A "${existing.type}" location requires a parent — can't be cleared to top-level.` },
        { status: 400 }
      );
    }
    if (parentId) {
      const parent = await prisma.location.findUnique({ where: { id: parentId }, select: { id: true, type: true } });
      if (!parent) {
        return NextResponse.json({ error: `Unknown parent location "${parentId}".` }, { status: 400 });
      }
      if (!allowedParentTypes.includes(parent.type)) {
        return NextResponse.json(
          {
            error: `A "${existing.type}" location's parent must be a ${allowedParentTypes.join(" or ")} — "${parentId}" is a ${parent.type}.`,
          },
          { status: 400 }
        );
      }
      if (await isDescendantOf(parentId, locationId)) {
        return NextResponse.json({ error: "That would create a cycle in the location tree." }, { status: 400 });
      }
    }
    data.parentId = parentId;
  }

  const updated = await prisma.location.update({ where: { id: locationId }, data });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    actorId: gate.user?.id,
    action:
      parsed.data.isActive !== undefined
        ? `Location ${parsed.data.isActive ? "reactivated" : "deactivated"}: "${existing.officialName}"`
        : boundaryGeometry !== undefined
          ? `Location boundary ${boundaryGeometry === null ? "cleared" : "updated"}: "${existing.officialName}"`
          : `Location updated: "${existing.officialName}"`,
    entityType: "Location",
    entityId: locationId,
    entityLabel: updated.officialName,
    previousState: existing,
    newState: updated,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { locationId } = await params;
  const existing = await prisma.location.findUnique({
    where: { id: locationId },
    include: { _count: { select: { children: true, properties: true, projects: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Location not found." }, { status: 404 });
  }

  const { children, properties, projects } = existing._count;
  if (children + properties + projects > 0) {
    return NextResponse.json(
      {
        error: `"${existing.officialName}" is still in use (${children} sub-location(s), ${properties} listing(s), ${projects} project(s)) — reassign or deactivate it instead of deleting.`,
        childCount: children,
        propertyCount: properties,
        projectCount: projects,
      },
      { status: 409 }
    );
  }

  await prisma.location.delete({ where: { id: locationId } });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    actorId: gate.user?.id,
    action: `Location deleted: "${existing.officialName}"`,
    entityType: "Location",
    entityId: locationId,
    entityLabel: existing.officialName,
    previousState: existing,
  });

  return NextResponse.json({ ok: true });
}
