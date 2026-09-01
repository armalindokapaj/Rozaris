import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAndValidateGlb } from "@/lib/glbValidate";
import { glbNodeNameKey } from "@/lib/glbNodeName";
import { logAuditEvent } from "@/lib/audit";
import { buildExperienceDocument } from "@/lib/experienceDocument";
import type { CameraPreset, NodeOverride, Project3DConfig, SceneManifestNode, ViewerUIToggles } from "@/lib/types";

const DEFAULT_VIEWER_UI: ViewerUIToggles = { home: true, unitSearch: true };

const createSchema = z.object({
  glbUrl: z.string().url(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  scale: z.number().positive().max(1000).default(1),
  rotationDeg: z.number().default(0),
  altitudeOffset: z.number().default(0),
  carryLinks: z.boolean().default(true),
  carryLinksFromVersionId: z.string().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; slotId: string }> }
) {
  const { slotId } = await params;
  const versions = await prisma.detailModelVersion.findMany({
    where: { slotId, deletedAt: null },
    orderBy: { version: "desc" },
    include: { unitLinks: true },
  });
  return NextResponse.json(versions);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; slotId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, slotId } = await params;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [project, slot] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.detailModelSlot.findUnique({ where: { id: slotId } }),
  ]);
  if (!project || project.deletedAt) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }
  if (!slot || slot.projectId !== projectId) {
    return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  }

  const validation = await fetchAndValidateGlb(parsed.data.glbUrl, "detailModel", slot.role);
  const last = await prisma.detailModelVersion.findFirst({
    where: { slotId },
    orderBy: { version: "desc" },
  });
  const nextVersion = (last?.version ?? 0) + 1;
  const actor = gate.user?.email ?? gate.user?.name ?? "admin";

  let publicAssetUrl = parsed.data.glbUrl;
  if (validation.status !== "blocked") {
    try {
      const sourceRes = await fetch(parsed.data.glbUrl);
      if (!sourceRes.ok) throw new Error(`Could not re-fetch source asset (HTTP ${sourceRes.status})`);
      const sourceBuffer = await sourceRes.arrayBuffer();
      const { optimizeGlbForDelivery } = await import("@/lib/glbOptimize");
      const optimized = await optimizeGlbForDelivery(sourceBuffer);
      const delivery = await put(`project-detail-models/delivery-${slotId}-v${nextVersion}.glb`, Buffer.from(optimized), {
        access: "public",
        addRandomSuffix: true,
        contentType: "model/gltf-binary",
        cacheControlMaxAge: 31536000,
      });
      publicAssetUrl = delivery.url;
    } catch (err) {
      console.error("3D Experience: delivery-asset optimization failed, using source asset as delivery too", err);
    }
  }

  const priorVersions = parsed.data.carryLinks
    ? await prisma.detailModelVersion.findMany({
        where: { slotId, deletedAt: null },
        orderBy: { version: "desc" },
        include: { unitLinks: true },
      })
    : [];
  const pinnedSource = parsed.data.carryLinksFromVersionId
    ? priorVersions.find((v) => v.id === parsed.data.carryLinksFromVersionId)
    : undefined;
  if (parsed.data.carryLinksFromVersionId && !pinnedSource) {
    return NextResponse.json(
      { error: "Carry-forward source version not found in this slot." },
      { status: 400 }
    );
  }
  const linkSource = pinnedSource ?? priorVersions.find((v) => v.unitLinks.length > 0) ?? null;
  const overrideSource =
    pinnedSource ??
    priorVersions.find((v) => ((v.nodeOverrides as NodeOverride[] | null) ?? []).length > 0) ??
    null;

  const nameToNewRzNodeId = new Map(
    validation.sceneManifest.map((n) => [glbNodeNameKey(n.name), n.rzNodeId])
  );
  const previousOverrides = (overrideSource?.nodeOverrides as NodeOverride[] | null) ?? [];
  const previousManifest = (overrideSource?.sceneManifest as SceneManifestNode[] | null) ?? [];
  const rzNodeIdToName = new Map(previousManifest.map((n) => [n.rzNodeId, n.name]));
  const carriedOverrides: NodeOverride[] = previousOverrides.flatMap((o) => {
    const name = rzNodeIdToName.get(o.rzNodeId);
    const newRzNodeId = name ? nameToNewRzNodeId.get(glbNodeNameKey(name)) : undefined;
    if (!newRzNodeId) return [];
    return [{ ...o, rzNodeId: newRzNodeId, carried: true }];
  });

  const newNameByKey = new Map<string, string>();
  for (const name of [...validation.unitNodeNames, ...validation.sceneManifest.map((n) => n.name)]) {
    const key = glbNodeNameKey(name);
    if (!newNameByKey.has(key)) newNameByKey.set(key, name);
  }

  const sourceLinks = linkSource?.unitLinks ?? [];
  const liveUnitIds = new Set(
    sourceLinks.length > 0
      ? (
          await prisma.unit.findMany({
            where: { id: { in: [...new Set(sourceLinks.map((l) => l.unitId))] }, projectId, deletedAt: null },
            select: { id: true },
          })
        ).map((u) => u.id)
      : []
  );

  const takenMeshNames = new Set<string>();
  const takenUnitIds = new Set<string>();
  const carryable: { meshName: string; link: (typeof sourceLinks)[number] }[] = [];
  const droppedLinks: string[] = [];
  for (const link of sourceLinks) {
    const newName = newNameByKey.get(glbNodeNameKey(link.meshName));
    if (!newName || !liveUnitIds.has(link.unitId) || takenMeshNames.has(newName) || takenUnitIds.has(link.unitId)) {
      droppedLinks.push(link.meshName);
      continue;
    }
    takenMeshNames.add(newName);
    takenUnitIds.add(link.unitId);
    carryable.push({ meshName: newName, link });
  }

  const carryReport = {
    carriedFromVersion: linkSource?.version ?? null,
    carriedCount: carryable.length,
    droppedMeshNames: droppedLinks,
    unmappedUnitNodeNames: validation.unitNodeNames.filter((n) => !takenMeshNames.has(n)),
  };

  const config3d = await prisma.project3DConfig.findUnique({ where: { projectId } });
  const experienceDocument = config3d
    ? buildExperienceDocument(
        {
          ...config3d,
          cameraPresets: (config3d.cameraPresets as unknown as CameraPreset[]) ?? [],
          viewerUI: (config3d.viewerUI as unknown as ViewerUIToggles) ?? DEFAULT_VIEWER_UI,
        } as unknown as Project3DConfig,
        {
          projectId,
          slotId,
          slotName: slot.name,
          version: nextVersion,
          scale: parsed.data.scale,
          rotationDeg: parsed.data.rotationDeg,
          altitudeOffset: parsed.data.altitudeOffset,
          nodeOverrides: carriedOverrides,
          unitLinks: carryable.map((c) => ({
            meshName: c.meshName,
            unitId: c.link.unitId,
            poiYawDeg: c.link.poiYawDeg,
          })),
          publicationStatus: "draft",
          validationStatus: validation.status,
        }
      )
    : null;

  const created = await prisma.$transaction(async (tx) => {
    const version = await tx.detailModelVersion.create({
      data: {
        projectId,
        slotId,
        version: nextVersion,
        sourceAssetUrl: parsed.data.glbUrl,
        publicAssetUrl,
        fileName: parsed.data.fileName,
        fileSize: parsed.data.fileSize,
        triangleCount: validation.triangleCount,
        meshCount: validation.meshCount,
        materialCount: validation.materialCount,
        textureCount: validation.textureCount,
        scale: parsed.data.scale,
        rotationDeg: parsed.data.rotationDeg,
        altitudeOffset: parsed.data.altitudeOffset,
        validationStatus: validation.status,
        validationIssues: validation.issues.length ? validation.issues : undefined,
        sceneManifest: validation.sceneManifest as unknown as Prisma.InputJsonValue,
        nodeOverrides: carriedOverrides.length
          ? (carriedOverrides as unknown as Prisma.InputJsonValue)
          : undefined,
        experienceDocument: experienceDocument
          ? (experienceDocument as unknown as Prisma.InputJsonValue)
          : undefined,
        publicationStatus: "draft",
        uploadedBy: actor,
      },
    });

    if (carryable.length > 0) {
      await tx.unitMeshLinkV2.createMany({
        data: carryable.map(({ meshName, link: l }) => ({
          detailModelVersionId: version.id,
          meshName,
          unitId: l.unitId,
          mappingStatus: "carried",
          poiYawDeg: l.poiYawDeg,
          poiEnabled: l.poiEnabled,
          poiDistanceOverride: l.poiDistanceOverride,
          poiHeightOverride: l.poiHeightOverride,
        })),
      });
    }

    return tx.detailModelVersion.findUniqueOrThrow({
      where: { id: version.id },
      include: { unitLinks: true },
    });
  });

  await logAuditEvent({
    actor,
    action: "Detail model version uploaded",
    entityType: "DetailModelVersion",
    entityId: created.id,
    entityLabel: `${project.name} · ${slot.name} v${created.version}`,
  });

  return NextResponse.json({ ...created, carryReport });
}
