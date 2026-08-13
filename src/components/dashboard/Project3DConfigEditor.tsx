"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { defaultProject3DConfig } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { extractUnitNodeNames } from "@/lib/glbUnitNodes";
import { calcSunriseSunset } from "@/lib/sunPosition";
import { pickDefaultQualityTier } from "@/lib/viewerPresets";
import { useProject3DEditorState } from "@/hooks/useProject3DEditorState";
import { useAutosave, type AutosaveStatus } from "@/hooks/useAutosave";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import { EditorShell } from "./project3d/EditorShell";
import type { DetailVersionRow } from "./project3d/types";
import type { PlatformHdri, Project, Project3DConfig } from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // keep in sync with api/blob/upload's maximumSizeInBytes

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Admin's "Project > 3D Experience" authoring surface — rendered as a
 * dedicated full page (`/admin/3d-experience/[projectId]/page.tsx`), not a
 * modal; `onClose` is that page's "go back to the admin console" action,
 * not a dialog dismiss. Two independent things live in one panel:
 * - Rendering/Quality/Lighting&Sun/Glass/Camera ("3D Experience Phase 1")
 *   — real, Postgres-backed (`/api/project-3d-config/[projectId]`),
 *   replacing the old Zustand-only, 100%-dead `Project3DConfig` table.
 * - The Detailed GLB itself (PRD_Admin_3D_Project_Experience) — unchanged
 *   by this pass, still the real versioned pipeline
 *   (src/app/api/detail-models/[projectId]/versions/**) with server-side
 *   validation, draft/publish/rollback and carried unit mappings.
 *
 * This component itself now only owns data-fetching/mutation state and
 * orchestration — the actual layout/JSX lives in `./project3d/EditorShell`
 * and its mode panels (Phase 2 — Editor UX rebuild, Milestone A: pure
 * extraction, no behavior change from the prior single-scroll version).
 */
export function Project3DConfigEditor({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  // Camera Presets (Render/visual quality pass) — "Save current view"
  // reads the live preview's own camera via this ref rather than adding a
  // second, independent camera tracked only in this form.
  const viewerRef = useRef<ThreeProjectViewerHandle>(null);
  const [newPresetLabel, setNewPresetLabel] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { t, locale } = useT();

  // --- Detailed GLB (versioned) — `versions`/`activeVersion` declared up
  // here (rather than down by the rest of the detail-model state, where
  // they used to live) so `useProject3DEditorState` can be called before
  // the config-load effect and `handleDeleteHdri` below reference the
  // `draft`/`update` it returns.
  const [versions, setVersions] = useState<DetailVersionRow[]>([]);
  const activeVersion = versions[0] ?? null;
  // Phase 2 Milestone B: draft/scale/rotationDeg/altitudeOffset/
  // linkSelections/nodeOverrides/selectedNodeRzId/sceneManifest (plus the
  // derived previewDetailModel) all now live in one hook instead of 8
  // separate useState calls here. Milestone C added real undo/redo on top
  // (draft/scale/rotationDeg/altitudeOffset/linkSelections/nodeOverrides
  // only — see useProject3DEditorState.ts for why selectedNodeRzId/
  // sceneManifest stay out of it). `hydrate()` is the non-undoable escape
  // hatch used for anything syncing FROM the server below (initial load,
  // `refresh()`, the row echoed back after a save) — never a user edit.
  const {
    draft,
    update,
    scale,
    setScale,
    rotationDeg,
    setRotationDeg,
    altitudeOffset,
    setAltitudeOffset,
    linkSelections,
    setLinkSelections,
    nodeOverrides,
    setNodeOverrides,
    hydrate,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedNodeRzId,
    setSelectedNodeRzId,
    sceneManifest,
    setSceneManifest,
    previewDetailModel,
  } = useProject3DEditorState(activeVersion);

  // --- Platform HDRI library (Task 2 — Track A) — fetched/managed here
  // (not via the read-only usePlatformHdris hook the public viewer uses)
  // since this is the one surface that also uploads/deletes library
  // entries and needs to refresh the list after doing so.
  const [platformHdris, setPlatformHdris] = useState<PlatformHdri[]>([]);
  const [hdriBusy, setHdriBusy] = useState(false);
  const [hdriError, setHdriError] = useState<string | null>(null);
  const hdriFileInputRef = useRef<HTMLInputElement>(null);

  async function refreshHdris() {
    const res = await fetch("/api/platform-hdri");
    if (res.ok) setPlatformHdris(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshHdris();
  }, []);

  async function handleHdriUpload(file: File) {
    setHdriError(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".hdr") && !lower.endsWith(".exr")) {
      setHdriError(t("admin.hdriInvalidFile"));
      return;
    }
    setHdriBusy(true);
    try {
      const blob = await upload(`platform-hdri/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        multipart: true,
      });
      const res = await fetch("/api/platform-hdri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name.replace(/\.(hdr|exr)$/i, ""), url: blob.url }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refreshHdris();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      console.error("Platform HDRI: upload failed", err);
      setHdriError(
        message.includes("Not authorized") || message.includes("authoriz")
          ? t("admin.sessionExpiredNote")
          : t("admin.hdriUploadFailed")
      );
    } finally {
      setHdriBusy(false);
    }
  }

  async function handleDeleteHdri(hdri: PlatformHdri) {
    if (!window.confirm(t("admin.hdriDeleteConfirm", { name: hdri.name }))) return;
    setHdriBusy(true);
    setHdriError(null);
    try {
      const res = await fetch(`/api/platform-hdri/${hdri.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      if (draft.hdriId === hdri.id) update({ hdriId: null }, { commit: true });
      await refreshHdris();
    } catch {
      setHdriError(t("admin.hdriDeleteFailed"));
    } finally {
      setHdriBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/project-3d-config/${project.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row: Project3DConfig | null) => {
        if (cancelled) return;
        // Any row saved before the Render/visual-quality or Publish/
        // runtime-hardening passes has `cameraPresets`/`viewerUI` as a
        // real `null` in Postgres (both are nullable Json columns) even
        // though `Project3DConfig`'s TS type declares them non-null — a
        // gap in Phase 2's own original loader, fixed here rather than
        // left in place now that it's been noticed.
        const next: Project3DConfig = row
          ? {
              ...row,
              cameraPresets: row.cameraPresets ?? [],
              viewerUI: row.viewerUI ?? defaultProject3DConfig.viewerUI,
            }
          : defaultProject3DConfig;
        // Silent — this is the initial load, not a user edit; must never
        // itself become an undo step.
        hydrate({ draft: next });
      })
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // hydrate's identity is stable (comes from useUndoRedo's useReducer
    // dispatch, itself stable) — omitted the same way every other setState
    // setter in this file is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const [detailLoaded, setDetailLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const localPreviewUrlRef = useRef<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailFlash, setDetailFlash] = useState<string | null>(null);
  const [detectedNodes, setDetectedNodes] = useState<string[] | null>(null);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [carriedMeshNames, setCarriedMeshNames] = useState<Set<string>>(new Set());
  const [showOnlyNeedsReview, setShowOnlyNeedsReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function detectNodes(glbUrl: string) {
    setNodesLoading(true);
    try {
      const names = await extractUnitNodeNames(glbUrl);
      setDetectedNodes(names);
    } catch {
      setDetectedNodes(null);
    } finally {
      setNodesLoading(false);
    }
  }

  async function refresh() {
    const res = await fetch(`/api/detail-models/${project.id}/versions`);
    const rows: DetailVersionRow[] = res.ok ? await res.json() : [];
    setVersions(rows);
    const active = rows[0] ?? null;
    if (active) {
      const selections: Record<string, string> = {};
      const carried = new Set<string>();
      // A link whose `unitId` no longer matches any current
      // `project.units` entry means that unit was deleted (Zustand
      // deletion has no way to reach back into this version's saved
      // UnitMeshLinkV2 row — the two are separate systems). Rather than
      // seed a "matched" selection the <select> below has no matching
      // <option> for (a confusing blank row that still counts toward
      // matchedCount), drop it here so it renders as unlinked/"needs
      // review" like any other unresolved mesh — the next Save Draft then
      // naturally prunes it from the DB, since the links route always
      // writes a full replacement set from whatever's in this state.
      active.unitLinks.forEach((link) => {
        if (!project.units.some((u) => u.id === link.unitId)) return;
        selections[link.meshName] = link.unitId;
        if (link.mappingStatus === "carried") carried.add(link.meshName);
      });
      // Silent, one combined sync — this is the server's version history,
      // not a user edit; must never itself become an undo step (and
      // shouldn't create 5 separate no-op history entries even if it were
      // tracked).
      hydrate({
        scale: active.scale,
        rotationDeg: active.rotationDeg,
        altitudeOffset: active.altitudeOffset,
        linkSelections: selections,
        nodeOverrides: Object.fromEntries((active.nodeOverrides ?? []).map((o) => [o.rzNodeId, o])),
      });
      setCarriedMeshNames(carried);
      setSceneManifest(active.sceneManifest ?? []);
      setSelectedNodeRzId(null);
      if (active.publicAssetUrl) void detectNodes(active.publicAssetUrl);
    }
    return rows;
  }

  useEffect(() => {
    let cancelled = false;
    // Initial version-history load, guarded by `cancelled` like every other
    // fetch effect in this app (see e.g. useProjectDetailModel.ts).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => {
      if (!cancelled) setDetailLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const isDraftActive = activeVersion?.publicationStatus === "draft";
  const canEditDetail = isDraftActive;

  async function handleDetailFile(file: File) {
    setDetailError(null);
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setDetailError(t("admin.detailModelInvalidFile"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setDetailError(t("admin.detailModelTooLarge", { max: formatBytes(MAX_FILE_BYTES) }));
      return;
    }
    if (localPreviewUrlRef.current) URL.revokeObjectURL(localPreviewUrlRef.current);
    localPreviewUrlRef.current = URL.createObjectURL(file);
    setDetailBusy(true);
    setUploadProgress(0);
    setDetectedNodes(null);
    try {
      const blob = await upload(`project-detail-models/${project.id}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: (p) => setUploadProgress(p.percentage),
        // See the identical comment in MapModelEditor.tsx — same fix,
        // same reason (detail models routinely run even larger).
        multipart: true,
      });
      const res = await fetch(`/api/detail-models/${project.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ glbUrl: blob.url, fileName: file.name, fileSize: file.size, scale, rotationDeg, altitudeOffset }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    } catch (err) {
      // "Not authorized" is what /api/blob/upload throws when the real
      // Auth.js admin session (separate from the Zustand "signed in as
      // Admin" mock — see admin/page.tsx) is missing or expired; surface
      // that distinctly since the fix (reconnect) differs from a generic
      // upload failure.
      // Surfacing the real underlying message (not just a generic "failed")
      // is what makes a failure like this diagnosable at all next time —
      // console.error always, and appended to the on-screen error too, so
      // it doesn't only live in a browser console nobody's looking at. Same
      // pattern as MapModelEditor.tsx's identical catch block.
      const message = err instanceof Error ? err.message : "";
      console.error("3D Experience: upload failed", err);
      setDetailError(
        message.includes("Not authorized") || message.includes("authoriz")
          ? t("admin.sessionExpiredNote")
          : message
          ? `${t("admin.detailModelUploadFailed")} (${message})`
          : t("admin.detailModelUploadFailed")
      );
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
    } finally {
      setDetailBusy(false);
      setUploadProgress(null);
    }
  }

  async function handleDiscardDraft() {
    if (!isDraftActive || !activeVersion) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/detail-models/${project.id}/versions/${activeVersion.id}`, { method: "DELETE" });
      // Was previously not checked at all — a failed delete (expired admin
      // session, already-published version, etc.) looked identical to a
      // successful one: no error shown, nothing removed. Only clear the
      // local preview state once the delete actually succeeded.
      if (!res.ok) throw new Error(await res.text());
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      await refresh();
      setDetectedNodes(null);
    } catch {
      setDetailError(t("admin.detailModelDeleteFailed"));
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleRemoveDetailModel() {
    if (!activeVersion || activeVersion.publicationStatus !== "published") return;
    if (!window.confirm(t("admin.detailModelRemoveConfirm"))) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/detail-models/${project.id}/versions/${activeVersion.id}/unpublish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      setDetailFlash(t("admin.detailModelRemoved"));
      setTimeout(() => setDetailFlash(null), 2500);
    } catch {
      setDetailError(t("admin.detailModelDeleteFailed"));
    } finally {
      setDetailBusy(false);
    }
  }

  /** Real, permanent delete — any status (draft/published/archived),
   * removes the Postgres row AND the stored blob (see the DELETE route's
   * own doc comment). Distinct from `handleRemoveDetailModel` above
   * (soft — archives a published version, stays in history/rollback-able)
   * and `handleDiscardDraft` (already permanent, but only ever reachable
   * for a draft). This is the one "Delete Model" action that works
   * regardless of the active version's state. */
  async function handleDeleteModel() {
    if (!activeVersion) return;
    if (!window.confirm(t("admin.detailModelDeleteModelConfirm"))) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/detail-models/${project.id}/versions/${activeVersion.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      await refresh();
      setDetectedNodes(null);
      setDetailFlash(t("admin.detailModelDeleted"));
      setTimeout(() => setDetailFlash(null), 2500);
    } catch {
      setDetailError(t("admin.detailModelDeleteFailed"));
    } finally {
      setDetailBusy(false);
    }
  }

  /** Per-history-row permanent delete for an old (non-active) version —
   * same DELETE route as `handleDeleteModel`, just targeting a specific
   * version id from the history list instead of the active one. */
  async function handleDeleteVersion(version: DetailVersionRow) {
    if (!window.confirm(t("admin.versionDeleteConfirm", { version: String(version.version) }))) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/detail-models/${project.id}/versions/${version.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      setDetailFlash(t("admin.versionDeleted"));
      setTimeout(() => setDetailFlash(null), 2500);
    } catch {
      setDetailError(t("admin.versionDeleteFailed"));
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleSaveDetailModel() {
    if (!activeVersion || !isDraftActive) return;
    const res = await fetch(`/api/detail-models/${project.id}/versions/${activeVersion.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scale, rotationDeg, altitudeOffset }),
    });
    if (!res.ok) throw new Error(await res.text());
    const links = Object.entries(linkSelections)
      .filter(([, unitId]) => unitId)
      .map(([meshName, unitId]) => ({ meshName, unitId }));
    const linksRes = await fetch(`/api/detail-models/${project.id}/versions/${activeVersion.id}/links`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(links),
    });
    if (!linksRes.ok) throw new Error(await linksRes.text());
    const sceneRes = await fetch(`/api/detail-models/${project.id}/versions/${activeVersion.id}/scene`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.values(nodeOverrides)),
    });
    if (!sceneRes.ok) throw new Error(await sceneRes.text());
  }

  // Milestone D — background autosave for the detail-model fields.
  // `handleSaveDetailModel` already reads scale/rotationDeg/altitudeOffset/
  // linkSelections/nodeOverrides from this render's live closure, so the
  // snapshot object below only needs to exist to give useAutosave
  // something whose *reference* changes exactly when a tracked field
  // actually does (same reasoning as useUndoRedo's snapshot) — its
  // contents aren't separately read by the save callback itself.
  const detailSnapshot = useMemo(
    () => ({ scale, rotationDeg, altitudeOffset, linkSelections, nodeOverrides }),
    [scale, rotationDeg, altitudeOffset, linkSelections, nodeOverrides]
  );
  const detailAutosave = useAutosave(detailSnapshot, () => handleSaveDetailModel(), {
    enabled: canEditDetail && detailLoaded && !!activeVersion,
  });

  async function handleDetailSave() {
    if (!activeVersion) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      await handleSaveDetailModel();
      await refresh();
      setDetailFlash(t("admin.mapModelSaved"));
      setTimeout(() => setDetailFlash(null), 2500);
    } catch {
      setDetailError(t("admin.detailModelSaveFailed"));
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleDetailPublish() {
    if (!activeVersion || !isDraftActive) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      await handleSaveDetailModel();
      const res = await fetch(`/api/detail-models/${project.id}/versions/${activeVersion.id}/publish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      setDetailFlash(t("admin.versionPublished"));
      setTimeout(() => setDetailFlash(null), 2500);
    } catch {
      setDetailError(t("admin.versionPublishFailed"));
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleDetailRollback(versionId: string) {
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/detail-models/${project.id}/versions/${versionId}/rollback`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      setDetailFlash(t("admin.versionRolledBack"));
      setTimeout(() => setDetailFlash(null), 2500);
    } catch {
      setDetailError(t("admin.versionRollbackFailed"));
    } finally {
      setDetailBusy(false);
    }
  }

  /** The actual PATCH — factored out of handleSaveScene so
   * `useAutosave`'s background instance (Milestone D) and the manual
   * "Save Scene" button call the exact same request, not two divergent
   * paths. */
  async function saveConfigValue(value: Project3DConfig) {
    const res = await fetch(`/api/project-3d-config/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error(await res.text());
    const updated: Project3DConfig = await res.json();
    // Silent — echoing back what the server just persisted, not a new
    // user edit; doesn't touch (or need to touch) undo history.
    hydrate({ draft: updated });
  }

  const configAutosave = useAutosave(draft, saveConfigValue, { enabled: configLoaded });

  async function handleSaveScene() {
    setConfigBusy(true);
    setConfigError(null);
    try {
      await saveConfigValue(draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch {
      setConfigError(t("admin.sceneSaveFailed"));
    } finally {
      setConfigBusy(false);
    }
  }

  function handleReset() {
    // Tracked, not silent — "Reset to defaults" is a real, discrete user
    // action and should be its own undoable step.
    update(defaultProject3DConfig, { commit: true });
  }

  const suggestedTier = pickDefaultQualityTier();
  const sunTimes = calcSunriseSunset(project.coords.lat, project.coords.lng, new Date());
  const hasDetailModel = !!activeVersion;
  // Counted against `detectedNodes` (this GLB's actual nodes), not the
  // wider `linkSelections` map, which can still carry stale entries for
  // mesh names a replacement GLB no longer has.
  const matchedCount = detectedNodes?.filter((n) => !!linkSelections[n]).length ?? 0;
  const needsReviewCount = (detectedNodes?.length ?? 0) - matchedCount;
  const visibleNodes = showOnlyNeedsReview
    ? (detectedNodes ?? []).filter((n) => !linkSelections[n])
    : detectedNodes ?? [];
  // Scene Explorer's classification stays consistent with Link Units
  // rather than introducing a second opinion about the same node: any
  // mesh name with a confirmed unit link here shows as "Unit Block"
  // there, not independently reclassifiable.
  const linkedMeshNames = new Set(Object.entries(linkSelections).filter(([, unitId]) => unitId).map(([name]) => name));

  // Milestone D — one combined status pill for both autosave instances:
  // "error" wins if either failed, then "saving" if either is in flight,
  // then "saved" once both are settled-and-clean. Never derived from
  // Publish (that's never wired to autosave at all).
  const autosaveStatus: AutosaveStatus =
    configAutosave.status === "error" || detailAutosave.status === "error"
      ? "error"
      : configAutosave.status === "saving" || detailAutosave.status === "saving"
      ? "saving"
      : configAutosave.status === "saved" || detailAutosave.status === "saved"
      ? "saved"
      : "idle";
  const autosaveError = configAutosave.error ?? detailAutosave.error;
  // ISO strings sort lexicographically in chronological order — no Date
  // parsing needed just to find whichever instance saved more recently.
  const autosaveLastSavedAt =
    [configAutosave.lastSavedAt, detailAutosave.lastSavedAt].filter((v): v is string => v != null).sort().at(-1) ?? null;
  function retryAutosave() {
    if (configAutosave.status === "error") void configAutosave.saveNow();
    if (detailAutosave.status === "error") void detailAutosave.saveNow();
  }

  return (
    <EditorShell
      project={project}
      onClose={onClose}
      t={t}
      locale={locale}
      draft={draft}
      update={update}
      suggestedTier={suggestedTier}
      advancedOpen={advancedOpen}
      setAdvancedOpen={setAdvancedOpen}
      configBusy={configBusy}
      configLoaded={configLoaded}
      configError={configError}
      savedFlash={savedFlash}
      onReset={handleReset}
      onSaveScene={handleSaveScene}
      undo={undo}
      redo={redo}
      canUndo={canUndo}
      canRedo={canRedo}
      autosaveStatus={autosaveStatus}
      autosaveError={autosaveError}
      autosaveLastSavedAt={autosaveLastSavedAt}
      onAutosaveRetry={retryAutosave}
      viewerRef={viewerRef}
      previewDetailModel={previewDetailModel}
      platformHdris={platformHdris}
      hdriBusy={hdriBusy}
      hdriError={hdriError}
      hdriFileInputRef={hdriFileInputRef}
      onHdriUpload={handleHdriUpload}
      onDeleteHdri={handleDeleteHdri}
      sunTimes={sunTimes}
      newPresetLabel={newPresetLabel}
      setNewPresetLabel={setNewPresetLabel}
      fileInputRef={fileInputRef}
      onDetailFile={handleDetailFile}
      hasDetailModel={hasDetailModel}
      activeVersion={activeVersion}
      canEditDetail={canEditDetail}
      detailBusy={detailBusy}
      onDiscardDraft={handleDiscardDraft}
      onRemoveDetailModel={handleRemoveDetailModel}
      onDeleteModel={handleDeleteModel}
      uploadProgress={uploadProgress}
      detailError={detailError}
      scale={scale}
      setScale={setScale}
      rotationDeg={rotationDeg}
      setRotationDeg={setRotationDeg}
      altitudeOffset={altitudeOffset}
      setAltitudeOffset={setAltitudeOffset}
      detailFlash={detailFlash}
      needsReviewCount={needsReviewCount}
      matchedCount={matchedCount}
      onDetailSave={handleDetailSave}
      onDetailPublish={handleDetailPublish}
      detailLoaded={detailLoaded}
      showHistory={showHistory}
      setShowHistory={setShowHistory}
      versions={versions}
      onDetailRollback={handleDetailRollback}
      onDeleteVersion={handleDeleteVersion}
      detectedNodes={detectedNodes}
      nodesLoading={nodesLoading}
      visibleNodes={visibleNodes}
      showOnlyNeedsReview={showOnlyNeedsReview}
      setShowOnlyNeedsReview={setShowOnlyNeedsReview}
      linkSelections={linkSelections}
      setLinkSelections={setLinkSelections}
      carriedMeshNames={carriedMeshNames}
      setCarriedMeshNames={setCarriedMeshNames}
      sceneManifest={sceneManifest}
      selectedNodeRzId={selectedNodeRzId}
      setSelectedNodeRzId={setSelectedNodeRzId}
      nodeOverrides={nodeOverrides}
      setNodeOverrides={setNodeOverrides}
      linkedMeshNames={linkedMeshNames}
    />
  );
}
