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
  clearcoat: z.number().min(0).max(1).optional(),
  clearcoatRoughness: z.number().min(0).max(1).optional(),
  iridescence: z.number().min(0).max(1).optional(),
  iridescenceIOR: z.number().min(1).max(2.333).optional(),
  visible: z.boolean().optional(),
  carried: z.boolean().optional(),

  materialOverrideEnabled: z.boolean().optional(),
  baseTextureEnabled: z.boolean().optional(),
  roughnessMapEnabled: z.boolean().optional(),
  metalnessMapEnabled: z.boolean().optional(),
  normalMapEnabled: z.boolean().optional(),
  normalStrength: z.number().min(0).max(4).optional(),
  aoMapEnabled: z.boolean().optional(),
  emissiveEnabled: z.boolean().optional(),
  emissiveMapEnabled: z.boolean().optional(),
  emissiveColorHex: z.string().optional(),
  emissiveIntensity: z.number().min(0).max(20).optional(),
  transmissionEnabled: z.boolean().optional(),
  transmission: z.number().min(0).max(1).optional(),
  ior: z.number().min(1).max(2.333).optional(),
  thickness: z.number().min(0).max(100).optional(),
  attenuationEnabled: z.boolean().optional(),
  attenuationColorHex: z.string().optional(),
  attenuationDistance: z.number().min(0).optional(),
  anisotropy: z.number().min(0).max(1).optional(),
  anisotropyRotation: z.number().optional(),
  sheen: z.number().min(0).max(1).optional(),
  sheenColorHex: z.string().optional(),
  sheenRoughness: z.number().min(0).max(1).optional(),
  dispersion: z.number().min(0).max(1).optional(),
  textureTransformEnabled: z.boolean().optional(),
  mapScaleX: z.number().optional(),
  mapScaleY: z.number().optional(),
  mapOffsetX: z.number().optional(),
  mapOffsetY: z.number().optional(),
  mapRotation: z.number().optional(),
});

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
