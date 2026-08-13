import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/**
 * The shared "Platform HDRI" library (Task 2 — Track A) — a genuinely new
 * platform-wide asset table, unlike everything else in the 3D pipeline
 * (which is always project- or version-scoped). `GET` is public, same
 * reasoning as `/api/project-3d-config/[projectId]`'s GET: the public
 * viewer needs to resolve a project's selected `hdriId` to a real URL, and
 * these are non-sensitive environment images, not something worth gating.
 * `POST`/`DELETE` are admin-only, same `requireAdmin()` pattern as every
 * other write route in this pipeline.
 */
const createSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
});

export async function GET() {
  const hdris = await prisma.platformHdri.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(hdris);
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const created = await prisma.platformHdri.create({
    data: { ...parsed.data, uploadedBy: actor },
  });

  await logAuditEvent({
    actor,
    action: "Platform HDRI added",
    entityType: "PlatformHdri",
    entityId: created.id,
    entityLabel: created.name,
  });

  return NextResponse.json(created);
}
