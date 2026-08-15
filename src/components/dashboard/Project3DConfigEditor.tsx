"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { defaultProject3DConfig } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { extractUnitNodeNames } from "@/lib/glbUnitNodes";
import { pickDefaultQualityTier } from "@/lib/viewerPresets";
import { useProject3DEditorState } from "@/hooks/useProject3DEditorState";
import { useProjectUnits } from "@/hooks/useProjectUnits";
import { useAutosave, type AutosaveStatus } from "@/hooks/useAutosave";
import { useAdminSessionRepair } from "@/hooks/useAdminSessionRepair";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import { EditorShell } from "./project3d/EditorShell";
import type { DetailVersionRow } from "./project3d/types";
import type { DetailModelSlot, Project, Project3DConfig, ProjectDetailModel } from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // keep in sync with api/blob/upload's maximumSizeInBytes

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Real bug fix (3D Experience Configurator audit): a fetch that hits any
 * of this editor's write routes (`src/lib/adminAuth.ts`'s `requireAdmin`)
 * with a 401 used to just fail outright — `useAutosave` surfaces that as
 * a tiny "error" line in the bottom status bar (easy to miss, no
 * prominent banner), which is exactly what reproduces as "my changes
 * don't save" reports. The existing repair mechanism
 * (`useAdminSessionRepair`'s status) only reacts to next-auth's own
 * cached client-side session status, which does NOT proactively notice
 * a server-side session/cookie loss — confirmed live (Playwright): after
 * clearing the real session cookie while the app still believed it was
 * signed in, an autosave 401'd with no amber "session expired" banner
 * ever appearing, because `useSession()`'s cached status never flipped to
 * "unauthenticated" on its own. This reacts to the actual response
 * instead of a cache: on a 401, surface the real sign-in prompt
 * immediately rather than waiting for `useSession()` to notice.
 *
 * ⚠️ Used to also silently re-authenticate and retry the request once —
 * removed as part of the auth-gap closure (see useAdminSessionRepair's
 * doc comment): that silent retry only worked because "re-authenticate"
 * meant "sign in with the hardcoded seeded admin credentials," which was
 * itself the security hole, not a real fix. There is no way to silently
 * re-establish a specific real admin's own session without their
 * credentials, so a 401 here is now a real dead end for the in-flight
 * request — the caller's existing error path surfaces it, and the admin
 * retries manually once actually reconnected. */
function fetchWithSessionRetry(
  input: string,
  init: RequestInit | undefined,
  onSessionExpired: () => void
): Promise<Response> {
  return fetch(input, init).then((res) => {
    if (res.status === 401) onSessionExpired();
    return res;
  });
}

/** Real bug fix (2026-08-14, "resize doesn't save"): a rejected PATCH
 * (e.g. `sectionSchema`'s zod validation failing on an out-of-range
 * `widthM`) used to surface as this hook's raw `res.text()` — the
 * literal JSON body of `{ error: parsed.error.flatten() }` — dumped
 * straight into an `Error`'s `.message`. That's unreadable, and
 * `useAutosave`'s own error display is a small line in the bottom status
 * bar an admin mid-drag has no reason to be looking at, so the actual
 * failure was effectively invisible: the edit just silently never
 * persisted, and the next load showed whatever was last *successfully*
 * saved — reads exactly like "resizing reverts to the small default."
 * Real root cause fixed separately (`widthM`/`depthM`'s max raised, the
 * Resize gizmo now clamps to match — see EditorShell.tsx's own note) —
 * this is the defense-in-depth half: whatever rejects a future PATCH,
 * the admin gets a real sentence, not a JSON blob. */
async function readConfigSaveError(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    const body = JSON.parse(raw) as { error?: unknown };
    const err = body?.error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const flat = err as { formErrors?: string[]; fieldErrors?: Record<string, unknown> };
      const messages: string[] = [...(flat.formErrors ?? [])];
      for (const [field, value] of Object.entries(flat.fieldErrors ?? {})) {
        if (Array.isArray(value) && value.length) messages.push(`${field}: ${value.join(", ")}`);
      }
      if (messages.length) return messages.join(" · ");
    }
  } catch {
    // Not JSON (or not the shape above) — fall through to the raw text
    // below rather than pretending there's a clean message to extract.
  }
  return raw || `HTTP ${res.status}`;
}

/** A non-focused slot's real, currently-saved placement — no live-edit
 * overlay (the admin isn't actively dragging that slot's sliders right
 * now), just what the server already has. The focused slot's own preview
 * instead comes from `useProject3DEditorState`'s `previewDetailModel`
 * (live in-progress edits included) — see `previewDetailModels` below. */
function detailModelFromVersion(version: DetailVersionRow): ProjectDetailModel {
  return {
    glbUrl: version.publicAssetUrl,
    fileName: version.fileName,
    fileSize: version.fileSize,
    scale: version.scale,
    rotationDeg: version.rotationDeg,
    altitudeOffset: version.altitudeOffset,
    enabled: true,
    updatedAt: version.createdAt,
    unitLinks: version.unitLinks.map((l) => ({ meshName: l.meshName, unitId: l.unitId })),
    sceneManifest: version.sceneManifest ?? [],
    nodeOverrides: version.nodeOverrides ?? [],
    triangleCount: version.triangleCount,
    meshCount: version.meshCount,
    materialCount: version.materialCount,
    textureCount: version.textureCount,
  };
}

/**
 * Admin's "Project > 3D Experience" authoring surface — rendered as a
 * dedicated full page (`/admin/3d-experience/[projectId]/page.tsx`), not a
 * modal; `onClose` is that page's "go back to the admin console" action,
 * not a dialog dismiss. Two independent things live in one panel:
 * - Rendering/Quality/Lighting&Sun/Glass/Camera ("3D Experience Phase 1")
 *   — real, Postgres-backed (`/api/project-3d-config/[projectId]`),
 *   replacing the old Zustand-only, 100%-dead `Project3DConfig` table.
 * - The Detailed GLB(s) (PRD_Admin_3D_Project_Experience, extended by the
 *   Multiple Detail-Model Slots pass) — still the real versioned pipeline
 *   (src/app/api/detail-models/[projectId]/slots/**) with server-side
 *   validation, draft/publish/rollback and carried unit mappings, now
 *   parameterized per named slot ("Building", "Surroundings", ...).
 *
 * Multiple Detail-Model Slots pass — the admin edits ONE slot's
 * scale/rotation/altitude/unit-links/scene-overrides/version-history at a
 * time (`activeSlotId`, a tab strip in `EditorShell.tsx`'s Model tab),
 * exactly the same live-editable/undoable state `useProject3DEditorState`
 * already provided for the old single-model world — switching slots just
 * re-hydrates that same hook from a different slot's data
 * (`hydrateFocusedFrom`). The 3D viewport still renders every enabled
 * slot simultaneously (`previewDetailModels`, plural) — non-focused
 * slots show their real last-saved placement (`detailModelFromVersion`),
 * not a live-edit overlay, since nothing is actively being dragged for
 * them right now.
 *
 * This component itself now only owns data-fetching/mutation state and
 * orchestration — the actual layout/JSX lives in `./project3d/EditorShell`
 * and its mode panels (Phase 2 — Editor UX rebuild, Milestone A: pure
 * extraction, no behavior change from the prior single-scroll version).
 */
export function Project3DConfigEditor({
  project,
  onClose,
  onDeleteProject,
  deletingProject = false,
}: {
  project: Project;
  onClose: () => void;
  // Real "delete a Project" from inside the editor itself — optional so
  // this component still works standalone (e.g. any future embedding that
  // doesn't want the action available) without every call site needing to
  // wire it up.
  onDeleteProject?: () => void;
  deletingProject?: boolean;
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
  // Real bug fix (Configurator audit) — see fetchWithSessionRetry's own
  // doc comment above for why this is needed even though
  // Admin3DExperiencePage (this component's parent route) already calls
  // useAdminSessionRepair for its banner; that instance's `sessionStatus`
  // is what drives the banner, this instance's `establishAdminSession` is
  // what actually recovers a write.
  const { establishAdminSession } = useAdminSessionRepair();

  // Units read-migration (Configurator scope) — real, live Postgres rows
  // instead of the static mockData/Zustand snapshot `project` arrives
  // with. Falls back to `project.units` while the fetch is in flight
  // (useProjectUnits's `units` field is `null` for exactly that gap —
  // see the hook's own doc comment). This is the one point every
  // Units-consuming surface below (UnitsPanel, BuildingNavRail, the live
  // preview viewport, and the unit-mesh-link reconciliation right below)
  // is redirected through — none of them need their own changes.
  // Read-only here: the Configurator has no unit-editing UI of its own
  // (adding/editing/deleting units happens exclusively through
  // ProjectUnitsEditor.tsx, a separate admin-dashboard surface — this
  // hook's mutate functions are that file's, not used here).
  const { units: liveUnits } = useProjectUnits(project.id);
  const effectiveProject = useMemo<Project>(
    () => ({ ...project, units: liveUnits ?? project.units }),
    [project, liveUnits]
  );

  // --- Detail-model slots (Multiple Detail-Model Slots pass) ---
  const [slots, setSlots] = useState<DetailModelSlot[]>([]);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [versionsBySlot, setVersionsBySlot] = useState<Record<string, DetailVersionRow[]>>({});
  const versions = activeSlotId ? versionsBySlot[activeSlotId] ?? [] : [];
  const activeVersion = versions[0] ?? null;
  // Phase 2 Milestone B: draft/scale/rotationDeg/altitudeOffset/
  // linkSelections/nodeOverrides/selectedNodeRzId/sceneManifest (plus the
  // derived previewDetailModel) all now live in one hook instead of 8
  // separate useState calls here. Milestone C added real undo/redo on top
  // (draft/scale/rotationDeg/altitudeOffset/linkSelections/nodeOverrides
  // only — see useProject3DEditorState.ts for why selectedNodeRzId/
  // sceneManifest stay out of it). `hydrate()` is the non-undoable escape
  // hatch used for anything syncing FROM the server below (initial load,
  // `refreshActiveSlot()`, the row echoed back after a save) — never a
  // user edit. Multiple Detail-Model Slots pass: this hook's `activeVersion`
  // input is always the currently-*focused* slot's — see `hydrateFocusedFrom`.
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
              sections: row.sections ?? [],
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

  /** Re-hydrates the focused editable fields (scale/rotation/altitude/
   * unit-links/scene-overrides/detected-nodes) from a specific version —
   * the shared step both the initial multi-slot load and every slot
   * switch/refresh need. `null` (a freshly-created, still-empty slot)
   * resets to a blank slate rather than leaving the *previous* slot's
   * values on screen. */
  function hydrateFocusedFrom(active: DetailVersionRow | null) {
    if (active) {
      const selections: Record<string, string> = {};
      const carried = new Set<string>();
      // A link whose `unitId` no longer matches any current
      // `effectiveProject.units` entry means that unit was deleted.
      // `effectiveProject.units` is real, live Postgres data as of the
      // Units read-migration (Configurator scope) — this check used to
      // compare against a mockData/Zustand snapshot that a real Postgres-
      // side deletion (via ProjectUnitsEditor.tsx) couldn't reach; now it
      // catches real deletions too, for free. Rather than seed a
      // "matched" selection the <select> below has no matching <option>
      // for (a confusing blank row that still counts toward matchedCount),
      // drop it here so it renders as unlinked/"needs review" like any
      // other unresolved mesh — the next Save Draft then naturally prunes
      // it from the DB, since the links route always writes a full
      // replacement set from whatever's in this state.
      active.unitLinks.forEach((link) => {
        if (!effectiveProject.units.some((u) => u.id === link.unitId)) return;
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
    } else {
      hydrate({ scale: 1, rotationDeg: 0, altitudeOffset: 0, linkSelections: {}, nodeOverrides: {} });
      setCarriedMeshNames(new Set());
      setSceneManifest([]);
      setSelectedNodeRzId(null);
      setDetectedNodes(null);
    }
  }

  /** Refetches just the focused slot's version history — every mutation
   * handler below calls this after its own write, same role the old
   * single-model `refresh()` played. */
  async function refreshActiveSlot(): Promise<DetailVersionRow[]> {
    if (!activeSlotId) return [];
    const res = await fetch(`/api/detail-models/${project.id}/slots/${activeSlotId}/versions`);
    const rows: DetailVersionRow[] = res.ok ? await res.json() : [];
    setVersionsBySlot((prev) => ({ ...prev, [activeSlotId]: rows }));
    hydrateFocusedFrom(rows[0] ?? null);
    return rows;
  }

  function handleSelectSlot(slotId: string) {
    if (slotId === activeSlotId) return;
    setActiveSlotId(slotId);
    hydrateFocusedFrom(versionsBySlot[slotId]?.[0] ?? null);
  }

  async function handleAddSlot(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/slots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      const slot: DetailModelSlot = await res.json();
      setSlots((prev) => [...prev, slot]);
      setVersionsBySlot((prev) => ({ ...prev, [slot.id]: [] }));
      setActiveSlotId(slot.id);
      hydrateFocusedFrom(null);
    } catch (err) {
      console.error("3D Experience: add slot failed", err);
      setDetailError(t("admin.slotAddFailed"));
    }
  }

  async function handleRenameSlot(slotId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/slots/${slotId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      const updated: DetailModelSlot = await res.json();
      setSlots((prev) => prev.map((s) => (s.id === slotId ? updated : s)));
    } catch (err) {
      console.error("3D Experience: rename slot failed", err);
      setDetailError(t("admin.slotRenameFailed"));
    }
  }

  async function handleDeleteSlot(slotId: string) {
    if (slots.length <= 1) return; // matches the server-side "keep at least one" rule
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    if (!window.confirm(t("admin.slotDeleteConfirm", { name: slot.name }))) return;
    try {
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/slots/${slotId}`,
        { method: "DELETE" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      const remaining = slots.filter((s) => s.id !== slotId);
      setSlots(remaining);
      setVersionsBySlot((prev) => {
        const next = { ...prev };
        delete next[slotId];
        return next;
      });
      if (activeSlotId === slotId && remaining[0]) {
        setActiveSlotId(remaining[0].id);
        hydrateFocusedFrom(versionsBySlot[remaining[0].id]?.[0] ?? null);
      }
    } catch (err) {
      console.error("3D Experience: delete slot failed", err);
      setDetailError(t("admin.slotDeleteFailed"));
    }
  }

  useEffect(() => {
    let cancelled = false;
    // Initial multi-slot load: every project already has at least one
    // real slot (scripts/migrate-detail-model-slots.ts backfilled
    // "Building" for any project that had a detail model before this
    // existed) — fetch the slot list, then every slot's own version
    // history in parallel (needed so the viewport can render every
    // non-focused slot's real current placement immediately, not just
    // the focused one — see `previewDetailModels` below).
    fetch(`/api/detail-models/${project.id}/slots`)
      .then((r) => (r.ok ? r.json() : []))
      .then(async (rows: DetailModelSlot[]) => {
        if (cancelled) return;
        setSlots(rows);
        const firstSlotId = rows[0]?.id ?? null;
        setActiveSlotId(firstSlotId);
        const entries = await Promise.all(
          rows.map(async (slot) => {
            const vres = await fetch(`/api/detail-models/${project.id}/slots/${slot.id}/versions`);
            const versionRows: DetailVersionRow[] = vres.ok ? await vres.json() : [];
            return [slot.id, versionRows] as const;
          })
        );
        if (cancelled) return;
        const bySlot = Object.fromEntries(entries);
        setVersionsBySlot(bySlot);
        if (firstSlotId) hydrateFocusedFrom(bySlot[firstSlotId]?.[0] ?? null);
      })
      .finally(() => {
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
    if (!activeSlotId) return;
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
      const blob = await upload(`project-detail-models/${project.id}-${activeSlotId}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: (p) => setUploadProgress(p.percentage),
        // See the identical comment in MapModelEditor.tsx — same fix,
        // same reason (detail models routinely run even larger).
        multipart: true,
      });
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/slots/${activeSlotId}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ glbUrl: blob.url, fileName: file.name, fileSize: file.size, scale, rotationDeg, altitudeOffset }),
        },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
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
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/versions/${activeVersion.id}`,
        { method: "DELETE" },
        establishAdminSession
      );
      // Was previously not checked at all — a failed delete (expired admin
      // session, already-published version, etc.) looked identical to a
      // successful one: no error shown, nothing removed. Only clear the
      // local preview state once the delete actually succeeded.
      if (!res.ok) throw new Error(await res.text());
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      await refreshActiveSlot();
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
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/versions/${activeVersion.id}/unpublish`,
        { method: "POST" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
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
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/versions/${activeVersion.id}`,
        { method: "DELETE" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      await refreshActiveSlot();
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
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/versions/${version.id}`,
        { method: "DELETE" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
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
    const res = await fetchWithSessionRetry(
      `/api/detail-models/${project.id}/versions/${activeVersion.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scale, rotationDeg, altitudeOffset }),
      },
      establishAdminSession
    );
    if (!res.ok) throw new Error(await res.text());
    const links = Object.entries(linkSelections)
      .filter(([, unitId]) => unitId)
      .map(([meshName, unitId]) => ({ meshName, unitId }));
    const linksRes = await fetchWithSessionRetry(
      `/api/detail-models/${project.id}/versions/${activeVersion.id}/links`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(links),
      },
      establishAdminSession
    );
    if (!linksRes.ok) throw new Error(await linksRes.text());
    const sceneRes = await fetchWithSessionRetry(
      `/api/detail-models/${project.id}/versions/${activeVersion.id}/scene`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.values(nodeOverrides)),
      },
      establishAdminSession
    );
    if (!sceneRes.ok) throw new Error(await sceneRes.text());
  }

  // Milestone D — background autosave for the detail-model fields.
  // `handleSaveDetailModel` already reads scale/rotationDeg/altitudeOffset/
  // linkSelections/nodeOverrides from this render's live closure, so the
  // snapshot object below only needs to exist to give useAutosave
  // something whose *reference* changes exactly when a tracked field
  // actually does (same reasoning as useUndoRedo's snapshot) — its
  // contents aren't separately read by the save callback itself. Keyed
  // implicitly by `activeSlotId` through `handleSaveDetailModel`'s own
  // closure over `activeVersion` — switching slots naturally starts
  // autosaving the newly-focused slot instead.
  const detailSnapshot = useMemo(
    () => ({ activeSlotId, scale, rotationDeg, altitudeOffset, linkSelections, nodeOverrides }),
    [activeSlotId, scale, rotationDeg, altitudeOffset, linkSelections, nodeOverrides]
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
      await refreshActiveSlot();
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
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/versions/${activeVersion.id}/publish`,
        { method: "POST" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
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
      const res = await fetchWithSessionRetry(
        `/api/detail-models/${project.id}/versions/${versionId}/rollback`,
        { method: "POST" },
        establishAdminSession
      );
      if (!res.ok) throw new Error(await res.text());
      await refreshActiveSlot();
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
    const res = await fetchWithSessionRetry(
      `/api/project-3d-config/${project.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      },
      establishAdminSession
    );
    if (!res.ok) throw new Error(await readConfigSaveError(res));
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

  // Multiple Detail-Model Slots pass — every enabled slot renders in the
  // viewport simultaneously: the focused one via the hook's own live
  // in-progress `previewDetailModel`, every other one from its own
  // already-fetched latest version (no local edit overlay — see this
  // file's own doc comment). Slots with no version yet are skipped, same
  // as the old single-model `null` case.
  const previewDetailModels = useMemo(() => {
    return slots.flatMap((slot) => {
      if (slot.id === activeSlotId) {
        return previewDetailModel ? [{ slotId: slot.id, model: previewDetailModel }] : [];
      }
      const version = versionsBySlot[slot.id]?.[0];
      return version ? [{ slotId: slot.id, model: detailModelFromVersion(version) }] : [];
    });
  }, [slots, activeSlotId, previewDetailModel, versionsBySlot]);

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
      project={effectiveProject}
      onClose={onClose}
      onDeleteProject={onDeleteProject ?? (() => {})}
      deletingProject={deletingProject}
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
      previewDetailModels={previewDetailModels}
      slots={slots}
      activeSlotId={activeSlotId}
      onSelectSlot={handleSelectSlot}
      onAddSlot={handleAddSlot}
      onRenameSlot={handleRenameSlot}
      onDeleteSlot={handleDeleteSlot}
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
