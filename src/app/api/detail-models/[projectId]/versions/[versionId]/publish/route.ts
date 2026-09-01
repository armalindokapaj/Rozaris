import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSuperAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const body = await request.json().catch(() => ({}));
  const force = Boolean(body?.force);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  const gate = force ? await requireSuperAdmin() : await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (force && !reason) {
    return NextResponse.json({ error: "A reason is required to force-publish." }, { status: 400 });
  }

  const { projectId, versionId } = await params;
  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.validationStatus === "blocked" && !force) {
    return NextResponse.json(
      { error: "Blocked by validation — fix the source GLB and upload a new version." },
      { status: 422 }
    );
  }

  const links = await prisma.unitMeshLinkV2.findMany({ where: { detailModelVersionId: versionId } });
  const unitIdCounts = new Map<string, number>();
  for (const l of links) unitIdCounts.set(l.unitId, (unitIdCounts.get(l.unitId) ?? 0) + 1);
  const duplicateUnitIds = Array.from(unitIdCounts.entries()).filter(([, count]) => count > 1);
  if (duplicateUnitIds.length > 0 && !force) {
    return NextResponse.json(
      {
        error: `${duplicateUnitIds.length} real unit${duplicateUnitIds.length === 1 ? " is" : "s are"} linked to more than one mesh in this version — fix the duplicate mapping${duplicateUnitIds.length === 1 ? "" : "s"} in Link Units before publishing.`,
      },
      { status: 422 }
    );
  }

  if (!force) {
    const slot = await prisma.detailModelSlot.findUnique({ where: { id: version.slotId } });
    if (slot?.role === "units") {
      const problems: string[] = [];

      if (!slot.transformParentSlotId) {
        problems.push("This Units slot has no Building anchor set — its transform would never track the architectural model.");
      } else {
        const parent = await prisma.detailModelSlot.findUnique({ where: { id: slot.transformParentSlotId } });
        if (!parent || parent.projectId !== projectId) {
          problems.push("This Units slot's Building anchor no longer exists — re-set it before publishing.");
        } else if (parent.role !== "building") {
          problems.push(`This Units slot's anchor ("${parent.name}") is no longer a Building-role slot — alignment would be meaningless.`);
        }
      }

      const manifest = (version.sceneManifest as { name: string }[] | null) ?? [];
      const unitNodeNames = new Set(manifest.map((n) => n.name).filter((n) => /^Unit_/i.test(n)));
      const mappedMeshNames = new Set(links.map((l) => l.meshName));
      const unmappedBlocks = Array.from(unitNodeNames).filter((n) => !mappedMeshNames.has(n));
      if (unmappedBlocks.length > 0) {
        problems.push(
          `${unmappedBlocks.length} unit block${unmappedBlocks.length === 1 ? "" : "s"} in this GLB ${unmappedBlocks.length === 1 ? "isn't" : "aren't"} mapped to a real unit (${unmappedBlocks.slice(0, 5).join(", ")}${unmappedBlocks.length > 5 ? ", …" : ""}) — map every block in the Units tab, or remove it from the GLB.`
        );
      }

      const projectUnits = await prisma.unit.findMany({ where: { projectId, deletedAt: null }, select: { id: true, code: true } });
      const mappedUnitIds = new Set(links.map((l) => l.unitId));
      const missingUnits = projectUnits.filter((u) => !mappedUnitIds.has(u.id));
      if (missingUnits.length > 0) {
        problems.push(
          `${missingUnits.length} real unit${missingUnits.length === 1 ? " has" : "s have"} no block in this GLB (${missingUnits.slice(0, 5).map((u) => u.code).join(", ")}${missingUnits.length > 5 ? ", …" : ""}) — add/map a block for ${missingUnits.length === 1 ? "it" : "each"}, or accept they'll show no 3D interaction volume.`
        );
      }

      if (problems.length > 0) {
        return NextResponse.json({ error: problems.join(" ") }, { status: 422 });
      }
    }
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.detailModelVersion.updateMany({
      where: { slotId: version.slotId, publicationStatus: "published", NOT: { id: versionId } },
      data: { publicationStatus: "archived" },
    });
    return tx.detailModelVersion.update({
      where: { id: versionId },
      data: { publicationStatus: "published", publishedAt: now, publishedBy: actor },
      include: { unitLinks: true },
    });
  });

  await refreshExperienceDocument(prisma, projectId, versionId);

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: force ? "Detail model force-published (validation bypassed)" : "Detail model published",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
    reason: force ? reason : undefined,
  });

  return NextResponse.json(updated);
}
