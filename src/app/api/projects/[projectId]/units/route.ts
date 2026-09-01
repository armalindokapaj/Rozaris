import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { notifyNewUnit } from "@/lib/notify";
import { bumpInventoryRevision } from "@/lib/publishing/inventoryRevision";

const unitSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  type: z.enum(["residential", "commercial", "parking", "storage"]),
  buildingName: z.string().min(1),
  floor: z.number().int(),
  area: z.number().positive(),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().int().min(0),
  price: z.number().positive(),
  currency: z.enum(["EUR", "ALL"]).optional().default("EUR"),
  transaction: z.enum(["sale", "rent", "coming_soon"]).optional().default("sale"),
  status: z.enum(["available", "reserved", "sold"]).optional().default("available"),
  images: z.array(z.string()).optional().default([]),
  floorPlanImage: z.string().optional().default(""),
  facadeImage: z.string().optional(),
  videoUrl: z.string().optional(),
  orientation: z.enum(["N", "E", "S", "W"]).nullish(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const units = await prisma.unit.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(units);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = unitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.deletedAt) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }

  const { id, ...data } = parsed.data;
  const unit = await prisma.unit.create({ data: { id, ...data, projectId } });
  await bumpInventoryRevision(projectId);

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Unit created",
    entityType: "Unit",
    entityId: unit.id,
    entityLabel: `${project.name} · ${unit.code}`,
    metadata: { projectId },
  });

  await notifyNewUnit({ id: project.id, slug: project.slug, name: project.name });

  return NextResponse.json(unit);
}

const bulkPatchSchema = z.object({
  unitIds: z.array(z.string().min(1)).min(1).max(500),
  patch: z
    .object({
      status: z.enum(["available", "reserved", "sold"]).optional(),
      transaction: z.enum(["sale", "rent", "coming_soon"]).optional(),
      currency: z.enum(["EUR", "ALL"]).optional(),
      buildingName: z.string().min(1).optional(),
      orientation: z.enum(["N", "E", "S", "W"]).nullish(),
      priceAdjustPercent: z.number().min(-90).max(500).optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: "Nothing to change." }),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = bulkPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { unitIds, patch } = parsed.data;
  const units = await prisma.unit.findMany({
    where: { id: { in: unitIds }, projectId, deletedAt: null },
  });
  if (units.length === 0) {
    return NextResponse.json({ error: "None of those units belong to this project." }, { status: 404 });
  }

  const { priceAdjustPercent, ...flat } = patch;
  const updated = [];
  for (const unit of units) {
    const data: Record<string, unknown> = { ...flat };
    if (priceAdjustPercent !== undefined) {
      data.price = Math.max(1, Math.round(unit.price * (1 + priceAdjustPercent / 100)));
    }
    updated.push(await prisma.unit.update({ where: { id: unit.id }, data }));
  }

  await bumpInventoryRevision(projectId);

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Units bulk-updated",
    entityType: "Project",
    entityId: projectId,
    entityLabel: `${updated.length} unit${updated.length === 1 ? "" : "s"}`,
    metadata: { projectId, unitCodes: updated.map((u) => u.code), patch },
  });

  return NextResponse.json(updated);
}
