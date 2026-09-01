import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import { LOCATION_TYPES, ALLOWED_PARENT_TYPES } from "@/lib/locationHierarchy";
import type { LocationType } from "@/generated/prisma";

const VALID_TYPES: LocationType[] = LOCATION_TYPES;

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const locations = await prisma.location.findMany({
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { officialName: "asc" }],
    include: {
      _count: { select: { children: true, properties: true, projects: true } },
    },
  });

  return NextResponse.json(
    locations.map((l) => ({
      id: l.id,
      parentId: l.parentId,
      type: l.type,
      officialName: l.officialName,
      slug: l.slug,
      latitude: l.latitude,
      longitude: l.longitude,
      isActive: l.isActive,
      sortOrder: l.sortOrder,
      childCount: l._count.children,
      propertyCount: l._count.properties,
      projectCount: l._count.projects,
      hasBoundary: l.boundaryGeometry != null,
    }))
  );
}

const createSchema = z.object({
  type: z.enum(VALID_TYPES as [LocationType, ...LocationType[]]),
  officialName: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { type, officialName, parentId, latitude, longitude, sortOrder } = parsed.data;

  const allowedParentTypes = ALLOWED_PARENT_TYPES[type];
  if (allowedParentTypes.length === 0) {
    if (parentId) {
      return NextResponse.json({ error: `A "${type}" location must be top-level (no parent).` }, { status: 400 });
    }
  } else if (!parentId) {
    return NextResponse.json({ error: `A parent is required for a "${type}" location.` }, { status: 400 });
  } else {
    const parent = await prisma.location.findUnique({ where: { id: parentId }, select: { id: true, type: true } });
    if (!parent) {
      return NextResponse.json({ error: `Unknown parent location "${parentId}".` }, { status: 400 });
    }
    if (!allowedParentTypes.includes(parent.type)) {
      return NextResponse.json(
        { error: `A "${type}" location's parent must be a ${allowedParentTypes.join(" or ")} — "${parentId}" is a ${parent.type}.` },
        { status: 400 }
      );
    }
  }

  const base = slugify(officialName);
  let slug = base;
  let id = base;
  let suffix = 2;
  while (
    (await prisma.location.findUnique({ where: { slug }, select: { id: true } })) ||
    (await prisma.location.findUnique({ where: { id }, select: { id: true } }))
  ) {
    slug = `${base}-${suffix}`;
    id = `${base}-${suffix}`;
    suffix++;
  }

  const location = await prisma.location.create({
    data: {
      id,
      slug,
      type,
      officialName: officialName.trim(),
      parentId: parentId ?? null,
      latitude,
      longitude,
      sortOrder,
    },
  });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    actorId: gate.user?.id,
    action: `Location created: "${location.officialName}" (${location.type})`,
    entityType: "Location",
    entityId: location.id,
    entityLabel: location.officialName,
    newState: location,
  });

  return NextResponse.json(location);
}
