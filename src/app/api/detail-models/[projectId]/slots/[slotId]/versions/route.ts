import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAndValidateGlb } from "@/lib/glbValidate";
// `optimizeGlbForDelivery` (below, inside the try block) is intentionally
// a dynamic import, not a static one here — see its call site's own
// comment for why: a static import of `@gltf-transform/core` was crashing
// this entire route MODULE on Vercel, not just the optimization step.
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
});

/**
 * Version history for one detail-model slot's GLB (Multiple Detail-Model
 * Slots pass — sibling slots each version completely independently; see
 * `DetailModelSlot`'s own doc comment). Moved from the old project-scoped
 * `.../versions/route.ts` — identical logic throughout, every
 * `where: { projectId }` that used to select "the project's one lineage
 * of versions" now selects "this slot's one lineage" instead. GET is
 * public (Project3DConfigEditor's version-history list); POST creates a
 * draft from an already-uploaded Blob URL, runs server-side validation,
 * and carries forward unit mesh mappings from the current published
 * version *of this same slot* for any mesh name the new GLB still has —
 * PRD §19 "Mapping Version Behavior".
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; slotId: string }> }
) {
  const { slotId } = await params;
  // deletedAt: null — same "discarded versions leave the editor's own
  // history list, restorable only via the Super Admin Recycle Bin" rule
  // as the map-model version-history list.
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

  const validation = await fetchAndValidateGlb(parsed.data.glbUrl, "detailModel");
  const last = await prisma.detailModelVersion.findFirst({
    where: { slotId },
    orderBy: { version: "desc" },
  });
  const nextVersion = (last?.version ?? 0) + 1;
  const actor = gate.user?.email ?? gate.user?.name ?? "admin";

  // Real original/delivery asset split (rewrite Track B, step 5):
  // `sourceAssetUrl` stays the untouched upload; `publicAssetUrl` — what
  // the public viewer and admin preview actually load — becomes a
  // separately-optimized copy when optimization succeeds. Skipped for an
  // already-blocked file (nothing to gain, and a structurally broken GLB
  // is exactly the input this step is least likely to handle predictably).
  // Falls back to the original URL on ANY failure — this step must never
  // be why an upload fails; worst case is today's exact pre-rewrite
  // behavior (source and delivery identical).
  //
  // Real production bug fix (2026-08-14, reported as "Admin write session
  // expired — uploads will fail" on Vercel, which was a red herring: the
  // actual failure had nothing to do with the admin session at all).
  // `optimizeGlbForDelivery` pulls in `@gltf-transform/core`, which pulls
  // in `ndarray-pixels`, which depends on `sharp` for texture pixel
  // decoding — and Vercel's runtime error log showed `sharp` failing to
  // `dlopen` its native `libvips` binary on every single request to this
  // route, GET and POST alike (confirmed there are two conflicting sharp
  // installs in node_modules — a hoisted 0.34.5 and ndarray-pixels' own
  // nested 0.35.3 — so the deployed function almost certainly traced/
  // shipped the wrong one's native binaries). That crash was happening at
  // MODULE LOAD time from the static top-level `import` this file used to
  // have, which happens before any of this function's own code — including
  // the try/catch right below — ever runs, so it took down the entire
  // route (even the unrelated GET handler, which never touches this at
  // all) instead of being safely caught. Loading it dynamically, inside
  // the try block, means a broken sharp install can now only ever disable
  // this one optimization step, exactly as the comment above already
  // promised it would.
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
      });
      publicAssetUrl = delivery.url;
    } catch (err) {
      console.error("3D Experience: delivery-asset optimization failed, using source asset as delivery too", err);
    }
  }

  const publishedVersion = await prisma.detailModelVersion.findFirst({
    where: { slotId, publicationStatus: "published", deletedAt: null },
    include: { unitLinks: true },
  });

  // Carry forward scene overrides (classification/material) whose node
  // NAME still exists in the new GLB's manifest — same "identical stable
  // name -> carry it forward" rule §19 already applies to unit links, just
  // hand-rolled here since overrides are a JSON blob, not a table with its
  // own mappingStatus column. rzNodeId is remapped to the *new* manifest's
  // id for that name, since the index component of the id can differ
  // between versions even when the name is unchanged.
  const nameToNewRzNodeId = new Map(validation.sceneManifest.map((n) => [n.name, n.rzNodeId]));
  const previousOverrides = (publishedVersion?.nodeOverrides as NodeOverride[] | null) ?? [];
  const previousManifest = (publishedVersion?.sceneManifest as SceneManifestNode[] | null) ?? [];
  const rzNodeIdToName = new Map(previousManifest.map((n) => [n.rzNodeId, n.name]));
  const carriedOverrides: NodeOverride[] = previousOverrides.flatMap((o) => {
    const name = rzNodeIdToName.get(o.rzNodeId);
    const newRzNodeId = name ? nameToNewRzNodeId.get(name) : undefined;
    if (!newRzNodeId) return [];
    return [{ ...o, rzNodeId: newRzNodeId, carried: true }];
  });

  // Carry forward mappings whose mesh name still exists in the new GLB —
  // PRD §19: "When a replacement GLB uses identical stable mesh names,
  // ROZARIS attempts to carry mappings forward." Anything else (renamed/
  // new/removed nodes) simply isn't created here; the admin editor's node
  // list will show it unlinked, same as a first upload. Lifted above the
  // transaction (doesn't depend on the new version's id) so it can also
  // feed the ExperienceDocument snapshot below.
  const carryable = (publishedVersion?.unitLinks ?? []).filter((l) =>
    validation.unitNodeNames.includes(l.meshName)
  );

  // ExperienceDocument snapshot (rewrite Track B, Phase 1) — additive,
  // only built when the project already has a Project3DConfig row (it's
  // an optional per-project row; nothing reads this document yet, so
  // there's no fallback-default to maintain here, unlike the read paths
  // real visitors hit).
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
          unitLinks: carryable.map((l) => ({ meshName: l.meshName, unitId: l.unitId })),
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
        // Cast needed for Prisma's Json input type — plain TS interfaces
        // (unlike z.any()-typed fields elsewhere in this codebase, e.g.
        // hiddenBuildings) don't structurally satisfy InputJsonObject's
        // index signature without it; the values themselves are already
        // plain serializable objects.
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
        data: carryable.map((l) => ({
          detailModelVersionId: version.id,
          meshName: l.meshName,
          unitId: l.unitId,
          mappingStatus: "carried",
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

  return NextResponse.json(created);
}
