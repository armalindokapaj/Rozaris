import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

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
 * AND write surface the Postgres `Unit` table has ever had. Prior to this,
 * `prisma.unit` was written only by `prisma/seed.ts` and read by nothing
 * (confirmed by a full-repo grep before this route was added). Every real
 * app surface — search, project pages, dashboard, the 3D viewer, this
 * project's own admin Units editor — still reads `src/lib/mockData.ts` +
 * Zustand `customProjects` exclusively; that stays true after this route
 * exists. This is deliberately additive/foundational, not a cutover: see
 * `ProjectUnitsEditor.tsx`'s dual-write (Zustand stays the source of truth
 * for what's displayed; this table now also gets the same data, for
 * whatever future read-migration work picks it up).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const units = await prisma.unit.findMany({ where: { projectId }, orderBy: { code: "asc" } });
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
  if (!project) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }

  const { id, ...data } = parsed.data;
  const unit = await prisma.unit.create({ data: { id, ...data, projectId } });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Unit created",
    entityType: "Unit",
    entityId: unit.id,
    entityLabel: `${project.name} · ${unit.code}`,
  });

  return NextResponse.json(unit);
}
