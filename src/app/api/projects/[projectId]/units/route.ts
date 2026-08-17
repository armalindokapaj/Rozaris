import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { notifyNewUnit } from "@/lib/notify";
import { bumpInventoryRevision } from "@/lib/publishing/inventoryRevision";

const unitSchema = z.object({
  // Client-supplied, not server-generated: ProjectUnitsEditor.tsx already
  // generates an id (`${project.id}-unit-${Date.now()}`) for the Zustand
  // side of its dual-write (see the route's own doc comment) — both sides
  // must agree on the same id for the two to stay coherent.
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
});

/**
 * Phase 3 (UnitManager + live-inventory write path) — the first real read
 * AND write surface the Postgres `Unit` table has ever had. Prior to
 * Phase 3, `prisma.unit` was written only by `prisma/seed.ts` and read by
 * nothing. Two later passes cut this table over to being the real source
 * of truth: the 3D Experience Configurator's own display (UnitsPanel,
 * BuildingNavRail, the live preview viewport — see `useProjectUnits.ts`)
 * reads it, and `ProjectUnitsEditor.tsx` (the admin dashboard's CRUD
 * surface) writes to it exclusively — no more Zustand `customProjects`
 * dual-write, which used to silently no-op for any of the 7 seeded
 * mockData projects and cause real, invisible data loss. Public search,
 * project pages, and dashboard analytics still read
 * `src/lib/mockData.ts` + Zustand exclusively — unaffected by either
 * pass, a separate, larger migration if ever wanted.
 */
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
  // Multi-Channel Publishing PRD Phase 6 — see inventoryRevision.ts's doc
  // comment: a new unit changes what the public inventory endpoint returns.
  await bumpInventoryRevision(projectId);

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Unit created",
    entityType: "Unit",
    entityId: unit.id,
    entityLabel: `${project.name} · ${unit.code}`,
  });

  // Real notification producer (Account & Profile System PRD v1.0 §5.3 —
  // see src/lib/notify.ts) — every real `Follow` (kind: project) on this
  // project gets a real Notification row.
  await notifyNewUnit({ id: project.id, slug: project.slug, name: project.name });

  return NextResponse.json(unit);
}
