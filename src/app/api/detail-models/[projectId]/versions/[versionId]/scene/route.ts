import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

const nodeOverrideSchema = z.object({
  rzNodeId: z.string().min(1),
  classification: z.enum(["architecture", "landscape", "interaction", "helper"]).optional(),
  materialPreset: z
    .enum(["concrete", "plaster", "stone", "wood", "aluminium", "steel", "chrome", "ceramic"])
    .optional(),
  colorHex: z.string().optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  // webgl_watch.html parity — see NodeOverride's own doc comment in
  // types.ts for why iridescenceIOR's range is 1-2.333, not 0-1.
  clearcoat: z.number().min(0).max(1).optional(),
  clearcoatRoughness: z.number().min(0).max(1).optional(),
  iridescence: z.number().min(0).max(1).optional(),
  iridescenceIOR: z.number().min(1).max(2.333).optional(),
  visible: z.boolean().optional(),
  carried: z.boolean().optional(),
});

/**
 * Admin's Scene Explorer node classification + material overrides for one
 * specific draft version (Editor UX & Scene Structure pass — sibling of
 * ./links/route.ts, kept separate since "which real Unit does this box
 * represent" and "how should this node render" are different concerns
 * that happen to live on the same GLB). Unlike links, overrides are a
 * plain `Json?` column on the version row, not a relational table — no
 * transaction needed, PUT replaces the whole array.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const parsed = z.array(nodeOverrideSchema).safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus === "published") {
    return NextResponse.json(
      { error: "Cannot edit scene overrides on a published version — upload a new draft instead." },
      { status: 409 }
    );
  }

  const updated = await prisma.detailModelVersion.update({
    where: { id: versionId },
    // Cast needed for Prisma's Json input type — see the identical
    // comment in ../route.ts's POST handler.
    data: { nodeOverrides: (parsed.data.length ? parsed.data : []) as unknown as Prisma.InputJsonValue },
  });
  await refreshExperienceDocument(prisma, projectId, versionId);

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    action: "Scene overrides updated",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${version.version} (${parsed.data.length} overrides)`,
  });

  return NextResponse.json(updated.nodeOverrides);
}
