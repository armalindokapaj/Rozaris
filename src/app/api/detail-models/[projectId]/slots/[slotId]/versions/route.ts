import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAndValidateGlb } from "@/lib/glbValidate";
import { glbNodeNameKey } from "@/lib/glbNodeName";
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
  /** Replacing a GLB keeps the slot's existing unit mappings and scene
   * overrides by default — see `carrySource` below. Sent as `false` by an
   * admin who deliberately wants a clean slate (a genuinely different
   * model in the same slot, where every old mapping is meaningless). */
  carryLinks: z.boolean().default(true),
  /** Optional explicit carry source. Omitted, the newest version that
   * actually has mappings wins; sent, that exact version's mappings are
   * used (the editor's "carry from v<n>" escape hatch for a lineage where
   * the newest mapped version is not the one the admin wants). */
  carryLinksFromVersionId: z.string().optional(),
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
 * and carries forward unit mesh mappings + scene node overrides from the
 * most recently authored version *of this same slot* for any node the new
 * GLB still has — PRD §19 "Mapping Version Behavior". See the carry-source
 * comment in POST for why "most recently authored" rather than the
 * published version specifically.
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

  const validation = await fetchAndValidateGlb(parsed.data.glbUrl, "detailModel", slot.role);
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
        // Every version gets its own random-suffixed URL (never
        // overwritten in place), so this is genuinely immutable — safe
        // to cache far past Blob's 1-month default. Read by
        // sw-3d-cache.js's cache-first Service Worker on repeat project
        // visits, and by any browser's own HTTP disk cache in between.
        cacheControlMaxAge: 31536000,
      });
      publicAssetUrl = delivery.url;
    } catch (err) {
      console.error("3D Experience: delivery-asset optimization failed, using source asset as delivery too", err);
    }
  }

  // WHICH version's authoring work a replacement GLB inherits.
  //
  // This used to be, unconditionally, "the currently PUBLISHED version" —
  // which quietly threw away the common case. An admin uploads a GLB,
  // spends real time linking every unit block to a listing, spots a
  // problem in the model, and re-uploads a corrected export before ever
  // publishing. The slot has no published version, so nothing carried and
  // they started from an empty mapping list every single time. Same loss
  // one step later: publish v1, upload v2, map it, re-upload v3 — v3
  // inherited published v1's mappings and silently discarded everything
  // authored on v2.
  //
  // The rule now is "the most recent version that actually has authoring
  // work on it", published or draft, which reduces to the old behavior
  // whenever the published version is genuinely the newest mapped one.
  // Links and overrides are resolved independently because they're
  // authored in different tabs and a version can easily have one without
  // the other. `carryLinksFromVersionId` pins the source explicitly;
  // `carryLinks: false` opts out of the whole thing.
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

  // Carry forward scene overrides (classification/material) whose node
  // NAME still exists in the new GLB's manifest — same "identical stable
  // name -> carry it forward" rule §19 already applies to unit links, just
  // hand-rolled here since overrides are a JSON blob, not a table with its
  // own mappingStatus column. rzNodeId is remapped to the *new* manifest's
  // id for that name, since the index component of the id can differ
  // between versions even when the name is unchanged.
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

  // Carry forward mappings whose mesh name still exists in the new GLB —
  // PRD §19: "When a replacement GLB uses identical stable mesh names,
  // ROZARIS attempts to carry mappings forward." Anything else (renamed/
  // new/removed nodes) simply isn't created here; the admin editor's node
  // list will show it unlinked, same as a first upload. Lifted above the
  // transaction (doesn't depend on the new version's id) so it can also
  // feed the ExperienceDocument snapshot below.
  //
  // Matching is by normalized key, not `===` on the raw string. The old
  // exact-match dropped a link whenever the stored spelling and the newly
  // parsed one differed in ways that are not a rename — most importantly
  // the GLTFLoader sanitization gap (`Unit.001` on the server vs the
  // `Unit001` a client-side link was stored under). See `glbNodeNameKey`.
  // Matched links are rewritten to the NEW file's own spelling so every
  // downstream consumer keyed off this version's manifest still resolves.
  //
  // Candidate names come from the manifest as well as `unitNodeNames`, so
  // a link an admin made to a block that doesn't follow the `Unit_*`
  // convention (which `unitNodeNames` filters out) survives too.
  const newNameByKey = new Map<string, string>();
  for (const name of [...validation.unitNodeNames, ...validation.sceneManifest.map((n) => n.name)]) {
    const key = glbNodeNameKey(name);
    if (!newNameByKey.has(key)) newNameByKey.set(key, name);
  }

  const sourceLinks = linkSource?.unitLinks ?? [];
  // A link pointing at a unit that has since been soft-deleted is dead
  // weight — the picker never offers it and the viewer can't render it —
  // so it's dropped rather than resurrected onto every future version.
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

  // Both of UnitMeshLinkV2's unique constraints are per-version, so two
  // source links collapsing onto one new name (or a duplicated unitId)
  // would make createMany throw. First writer wins — deterministic,
  // because `sourceLinks` comes back ordered from one version's rows.
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

  // What the editor tells the admin after a replace, so "kept 12, 3 new
  // blocks to map" is visible instead of being something they have to
  // infer by scrolling the mapping list.
  const carryReport = {
    carriedFromVersion: linkSource?.version ?? null,
    carriedCount: carryable.length,
    droppedMeshNames: droppedLinks,
    unmappedUnitNodeNames: validation.unitNodeNames.filter((n) => !takenMeshNames.has(n)),
  };

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
        data: carryable.map(({ meshName, link: l }) => ({
          detailModelVersionId: version.id,
          meshName,
          unitId: l.unitId,
          mappingStatus: "carried",
          // Units Blocks & POI Layer PRD §7 — carry the POI fields
          // forward with the mapping, same as everything else on this
          // row. Without this, every routine GLB replacement would
          // silently reset every unit's camera-facing direction back to
          // 0°, discarding real admin authoring work for no reason tied
          // to the actual new GLB.
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

  // `carryReport` is response-only (nothing persists it) — the editor
  // reads it once to flash "kept N of M mappings" right after a replace.
  return NextResponse.json({ ...created, carryReport });
}
