"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ArrowLeft, Crosshair, History, MapPin, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn, formatRelativeDate } from "@/lib/utils";
import { MapModelMapPreview, type HiddenBuildingEntry } from "./MapModelMapPreview";
import { ValidationBadge } from "./ValidationBadge";
import type { BuildingFootprint } from "@/components/map/BuildingHider";
import type { GeoPoint, Project } from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // keep in sync with api/blob/upload's maximumSizeInBytes
// Two picked buildings within this many degrees of each other are treated
// as "the same building" for toggle-off purposes when neither has a usable
// feature id — roughly 5m at Tirana's latitude.
const SAME_BUILDING_EPSILON_DEG = 0.00005;

interface VersionRow {
  id: string;
  version: number;
  // Nullable as of "save location before uploading a model" — a version
  // can exist as pure placement with no file at all yet (see
  // MapModelVersion's own doc comment in prisma/schema.prisma).
  fileName: string | null;
  fileSize: number | null;
  scale: number;
  heading: number;
  altitude: number;
  latitude: number;
  longitude: number;
  hideBaseBuilding: boolean;
  hiddenBuildings: HiddenBuildingEntry[] | null;
  validationStatus: "ready" | "warning" | "blocked";
  validationIssues: string[] | null;
  publicationStatus: "draft" | "published" | "archived";
  publicAssetUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
}

/** The version the editor treats as "the current model" — the newest
 * draft or published row, ignoring archived ones. Archived versions (e.g.
 * right after "Remove model") already have their own explicit UI (the
 * version-history list, with a Rollback button) — without this filter,
 * `versions[0]` would still pick up an archived row and the editor would
 * keep showing it (file info card, preview, etc.) with no delete button
 * left to press, since neither "discard draft" nor "remove model" applies
 * to something already archived. That dead end — Admin removes their
 * model, sees it archived-but-still-displayed with no further action
 * available — was the actual bug behind "no way to delete without
 * replacing"; the remove action itself already worked. */
function pickActiveVersion(rows: VersionRow[]): VersionRow | null {
  return rows.find((v) => v.publicationStatus !== "archived") ?? null;
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Admin's "3D Map Control" authoring surface (PRD_Admin_Mapbox_GLB) —
 * rendered as a dedicated full page (`/admin/3d-map-control/[projectId]/
 * page.tsx`), not a modal; `onClose` is that page's "go back to the admin
 * console" action, not a dialog dismiss.
 * Upload -> Validate -> Position -> Preview -> Publish, with real version
 * history/draft/publish/rollback (src/app/api/map-models/[projectId]/
 * versions/**) instead of the pre-versioning single mutable row. Preview
 * uses the SAME Mapbox map/style/ProjectModelLayer as every other map in
 * Rozaris, centered on this project's real coordinates.
 *
 * "Multi-building-pick + reposition" pass: `hiddenBuildingLng/Lat` (one
 * point per project) is replaced by `hiddenBuildings` (a list — Admin can
 * pick, and un-pick, several real buildings) — see MapModelMapPreview.tsx
 * and BuildingHider.ts for the mechanics.
 *
 * ONE LOCATION. The draggable pin is no longer a model position of its
 * own: it IS the project's site coordinates, controlled by the caller via
 * `location`/`onLocationChange`, and every `MapModelVersion` is anchored
 * to it server-side (src/lib/projectLocation.ts). That reverses the
 * earlier "reposition" pass, which let the model sit somewhere the record,
 * the search pin and the units' listings did not — three coordinates for
 * one building, with nothing reconciling them. Placement that IS model
 * content — scale, heading, altitude, hidden footprints — still belongs to
 * the version and keeps its own draft/publish lifecycle.
 */
export function MapModelEditor({
  project,
  location,
  onLocationChange,
  onSaveLocation,
  locationDirty = false,
  savingLocation = false,
  locationNote,
  reloadToken,
  onClose,
  onDeleteProject,
  deletingProject = false,
  embedded = false,
}: {
  project: Project;
  /** ONE LOCATION — the project's real site coordinates, owned by the
   * caller. There is no separate "model position" any more: dragging the
   * pin here moves the project itself, and every map-model version is
   * re-anchored to it server-side (src/lib/projectLocation.ts). The two
   * callers differ only in how they persist it — the standalone page
   * PATCHes `/api/admin/projects/[id]/location` (and passes
   * `onSaveLocation`), the Project Manager folds it into its own record
   * draft and save bar (and doesn't). */
  location: GeoPoint;
  onLocationChange: (point: GeoPoint) => void;
  /** Present only when this editor owns persistence — renders its own
   * "Save location" button. Absent means the surrounding record view
   * saves it. */
  onSaveLocation?: () => void;
  locationDirty?: boolean;
  savingLocation?: boolean;
  /** Replaces the default "this pin is shared" line — the Project Manager
   * says "…and saves with the record" instead. */
  locationNote?: string;
  /** Bump to make this editor refetch its version list. The caller owns
   * the location, so a location save happens entirely outside this
   * component — and the server re-anchors every version as part of it
   * (src/lib/projectLocation.ts). Without a nudge the version rows held
   * here keep their pre-save coordinates, which is what the "model isn't
   * where the record says" notice compares against: it would go on
   * claiming a split that the save just resolved. */
  reloadToken?: unknown;
  /** The standalone page's "back to the console" action. Unused when
   * `embedded` — the back arrow it drives lives in the record view's own
   * header there. */
  onClose?: () => void;
  // Real "delete a Project" from inside the editor itself — optional so
  // this component still works standalone without every call site needing
  // to wire it up (mirrors Project3DConfigEditor.tsx's identical prop).
  onDeleteProject?: () => void;
  deletingProject?: boolean;
  /** Rendered inside the Project Manager's scrolling record view rather
   * than as a whole page: drops the back arrow and the delete-project
   * button (the record view has its own header for both) and stops
   * claiming `h-full`. */
  embedded?: boolean;
}) {
  const { t, locale } = useT();

  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  /** Non-fatal notes from the Mapbox normalization pass — currently only
   * the 16-bit index ceiling (see glbMapboxNormalize.ts). Surfaced next to
   * the upload error so an over-budget model is visible rather than just
   * quietly rendering wrong. */
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [relocating, setRelocating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable placement — synced from the active draft (or the published
  // version, read-only, if there's no draft to edit) whenever the version
  // list changes underneath it.
  const [scale, setScale] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [altitudeOffset, setAltitudeOffset] = useState(0);
  const [hideBaseBuilding, setHideBaseBuilding] = useState(false);
  const [hiddenBuildings, setHiddenBuildings] = useState<HiddenBuildingEntry[]>([]);

  async function refresh() {
    const res = await fetch(`/api/map-models/${project.id}/versions`);
    const rows: VersionRow[] = res.ok ? await res.json() : [];
    setVersions(rows);
    const active = pickActiveVersion(rows);
    if (active) {
      setScale(active.scale);
      setRotationDeg(active.heading);
      setAltitudeOffset(active.altitude);
      // Deliberately NOT seeding coordinates from the version any more —
      // `location` is the project's, owned by the caller, and the version's
      // own columns are now server-derived from it.
      setHideBaseBuilding(active.hideBaseBuilding);
      setHiddenBuildings(active.hiddenBuildings ?? []);
    }
    return rows;
  }

  useEffect(() => {
    let cancelled = false;
    // Initial version-history load — and a re-load whenever `reloadToken`
    // changes (see that prop's own comment). Guarded by `cancelled` like
    // every other fetch effect in this app (see e.g.
    // useProjectDetailModel.ts).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, reloadToken]);

  const activeVersion = pickActiveVersion(versions);
  const isDraftActive = activeVersion?.publicationStatus === "draft";

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setError(t("admin.mapModelInvalidFile"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t("admin.mapModelTooLarge", { max: formatBytes(MAX_FILE_BYTES) }));
      return;
    }
    setBusy(true);
    setUploadProgress(0);
    try {
      // Mapbox's model loader cannot read interleaved vertex attributes —
      // the layout most exporters emit by default — and fails with a bare
      // `RangeError: offset is out of bounds` instead of anything
      // diagnosable. Re-laying the file out BEFORE it reaches Vercel Blob
      // means the stored file, the version history, the admin preview
      // below and the public search map are all the same Mapbox-ready
      // bytes; see src/lib/glbMapboxNormalize.ts for the full mechanism.
      //
      // Imported dynamically so `@gltf-transform/core` only enters the
      // bundle an admin actually loads, and wrapped so a file it can't
      // re-serialize still uploads as-is (worst case is the pre-existing
      // behavior) rather than blocking the upload outright.
      let payload: File | Blob = file;
      let normalizeWarnings: string[] = [];
      try {
        const { normalizeGlbForMapbox } = await import("@/lib/glbMapboxNormalize");
        const result = await normalizeGlbForMapbox(new Uint8Array(await file.arrayBuffer()));
        normalizeWarnings = result.warnings;
        if (result.changed) {
          payload = new File([result.bytes as BlobPart], file.name, { type: "model/gltf-binary" });
        }
      } catch (normalizeError) {
        console.error("3D Map Control: could not normalize GLB for Mapbox, uploading as-is", normalizeError);
      }
      if (normalizeWarnings.length > 0) {
        console.warn("3D Map Control: GLB warnings", normalizeWarnings);
        setWarnings(normalizeWarnings);
      } else {
        setWarnings([]);
      }
      // The preview shows the SAME bytes that are being uploaded, not the
      // raw file — otherwise the map preview would try to render the
      // un-normalized original and fail exactly the way the published
      // model no longer does.
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(payload);
      });
      const blob = await upload(`project-map-models/${project.id}-${file.name}`, payload, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: (p) => setUploadProgress(p.percentage),
        // Vercel's own guidance: single-request client uploads get
        // unreliable somewhere in the single-digit-MB range (real GLB
        // exports routinely land right in that zone) — multipart chunks
        // the upload, sends parts in parallel, and retries a failed part
        // instead of the whole file, which is what was almost certainly
        // failing 7MB uploads outright before this.
        multipart: true,
      });
      // "Add the 3D model later" — an existing DRAFT version with no file
      // yet (placement saved/published without one, see handleSaveDraft's
      // own doc comment) attaches this upload via PATCH instead of POSTing
      // a whole new version: it's still "the model for this position,"
      // not a replacement of anything. Any other case (no draft at all, or
      // the active draft already has its own file — "Replace") POSTs a new
      // version, same as always.
      const attachTarget = isDraftActive && activeVersion && !activeVersion.publicAssetUrl ? activeVersion : null;
      const res = attachTarget
        ? await fetch(`/api/map-models/${project.id}/versions/${attachTarget.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ glbUrl: blob.url, fileName: file.name, fileSize: payload.size }),
          })
        : await fetch(`/api/map-models/${project.id}/versions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              glbUrl: blob.url,
              fileName: file.name,
              fileSize: payload.size,
              scale,
              rotationDeg,
              altitudeOffset,
              hideBaseBuilding,
              hiddenBuildings,
            }),
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
      // it doesn't only live in a browser console nobody's looking at.
      const message = err instanceof Error ? err.message : "";
      console.error("3D Map Control: upload failed", err);
      setError(
        message.includes("Not authorized") || message.includes("authoriz")
          ? t("admin.sessionExpiredNote")
          : message
          ? `${t("admin.mapModelUploadFailed")} (${message})`
          : t("admin.mapModelUploadFailed")
      );
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }

  async function handleDiscardDraft() {
    if (!isDraftActive || !activeVersion) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/map-models/${project.id}/versions/${activeVersion.id}`, { method: "DELETE" });
      // Was previously not checked at all — a failed delete (expired admin
      // session, already-published version, etc.) looked identical to a
      // successful one: no error shown, nothing removed. Only clear the
      // local preview/picking state once the delete actually succeeded.
      if (!res.ok) throw new Error(await res.text());
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
      }
      await refresh();
      setPicking(false);
      setRelocating(false);
    } catch {
      setError(t("admin.mapModelDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Edit" — opens a new draft on the *same already-uploaded file* so
   * Admin can adjust placement (scale/rotation/altitude/position/hidden
   * buildings) without re-uploading anything. A published `MapModelVersion`
   * is immutable server-side (PATCH .../versions/[id] 409s on one — see
   * that route's comment), so "editing" always means opening a fresh draft
   * version first; this just does that automatically by POSTing the
   * published version's own `glbUrl` back to the versions endpoint (which
   * re-validates the existing Blob file — no new upload — and creates the
   * next version number as a draft), instead of making Admin click
   * "Replace" and pick a file again just to change a slider.
   */
  async function handleEdit() {
    if (isDraftActive || !activeVersion) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/map-models/${project.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // A published version can itself be placement-only (no model
          // uploaded yet) — omit these three entirely rather than send
          // literal `null`s (the API only accepts a real URL string or the
          // key being absent), so editing one just opens another
          // placement-only draft, same as if it had never had a file.
          ...(activeVersion.publicAssetUrl && {
            glbUrl: activeVersion.publicAssetUrl,
            fileName: activeVersion.fileName,
            fileSize: activeVersion.fileSize,
          }),
          scale,
          rotationDeg,
          altitudeOffset,
          hideBaseBuilding,
          hiddenBuildings,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      console.error("3D Map Control: edit (open draft from existing file) failed", err);
      setError(
        message.includes("Not authorized") || message.includes("authoriz")
          ? t("admin.sessionExpiredNote")
          : t("admin.mapModelEditFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Save the location before uploading a model" — when there's no version
   * at all yet, Save creates one as a pure placement draft (no glbUrl,
   * see MapModelVersion's own doc comment) instead of requiring a file
   * first; an already-active draft just gets its placement PATCHed, same
   * as always. Either way this is the one path both handlePublish and the
   * Save Draft button go through, so "positioned but no model yet" is
   * never a special case anywhere else.
   */
  async function handleSaveDraft() {
    if (!canEdit) return;
    if (activeVersion && !isDraftActive) return; // viewing a published version read-only
    setBusy(true);
    setError(null);
    try {
      const body = JSON.stringify({ scale, rotationDeg, altitudeOffset, hideBaseBuilding, hiddenBuildings });
      const res = activeVersion
        ? await fetch(`/api/map-models/${project.id}/versions/${activeVersion.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await fetch(`/api/map-models/${project.id}/versions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      setFlash(t("admin.mapModelSaved"));
      setTimeout(() => setFlash(null), 2500);
    } catch {
      setError(t("admin.mapModelSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (!canEdit) return;
    if (activeVersion && !isDraftActive) return;
    setBusy(true);
    setError(null);
    try {
      await handleSaveDraft();
      // Re-read fresh from the server rather than trusting the closed-over
      // `activeVersion` — when this is the very first save (no version
      // existed when this call started), handleSaveDraft's own POST above
      // just created one that this component doesn't have an id for yet.
      const rows = await refresh();
      const target = pickActiveVersion(rows);
      if (!target) throw new Error("No draft to publish.");
      const res = await fetch(`/api/map-models/${project.id}/versions/${target.id}/publish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      setFlash(t("admin.versionPublished"));
      setTimeout(() => setFlash(null), 2500);
    } catch {
      setError(t("admin.versionPublishFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveModel() {
    if (!activeVersion || activeVersion.publicationStatus !== "published") return;
    if (!window.confirm(t("admin.mapModelRemoveConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/map-models/${project.id}/versions/${activeVersion.id}/unpublish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      setFlash(t("admin.mapModelRemoved"));
      setTimeout(() => setFlash(null), 2500);
    } catch {
      setError(t("admin.mapModelDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  /** Real permanent(-ish) delete, any status — distinct from
   * `handleRemoveModel` above (soft — archives a published version, stays
   * in history/rollback-able) and `handleDiscardDraft` (already soft-
   * delete, but only ever reachable for a draft). This is the one "Delete
   * Model" action that works regardless of the active version's state —
   * same shape as Project3DConfigEditor.tsx's identical `handleDeleteModel`
   * for the 3D Experience side, added for parity (real user report: no way
   * to delete a 3D Map Control model at all beyond discarding a draft). */
  async function handleDeleteModel() {
    if (!activeVersion) return;
    if (!window.confirm(t("admin.mapModelDeleteModelConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/map-models/${project.id}/versions/${activeVersion.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl(null);
      }
      await refresh();
      setPicking(false);
      setRelocating(false);
      setFlash(t("admin.mapModelDeleted"));
      setTimeout(() => setFlash(null), 2500);
    } catch {
      setError(t("admin.mapModelDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  /** Per-history-row permanent(-ish) delete for an old (non-active)
   * version — same DELETE route as `handleDeleteModel`, just targeting a
   * specific version id from the history list instead of the active one. */
  async function handleDeleteVersion(version: VersionRow) {
    if (!window.confirm(t("admin.versionDeleteConfirm", { version: String(version.version) }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/map-models/${project.id}/versions/${version.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
    } catch {
      setError(t("admin.mapModelDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRollback(versionId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/map-models/${project.id}/versions/${versionId}/rollback`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      setFlash(t("admin.versionRolledBack"));
      setTimeout(() => setFlash(null), 2500);
    } catch {
      setError(t("admin.versionRollbackFailed"));
    } finally {
      setBusy(false);
    }
  }

  function handleToggleBuilding(point: { lng: number; lat: number }, feature: mapboxgl.MapboxGeoJSONFeature) {
    setHiddenBuildings((current) => {
      const idx = current.findIndex((b) =>
        feature.id != null && b.featureId != null
          ? b.featureId === feature.id
          : Math.hypot(b.lng - point.lng, b.lat - point.lat) < SAME_BUILDING_EPSILON_DEG
      );
      if (idx >= 0) return current.filter((_, i) => i !== idx);
      return [
        ...current,
        {
          lng: point.lng,
          lat: point.lat,
          footprint: (feature.geometry as BuildingFootprint) ?? null,
          featureId: feature.id,
        },
      ];
    });
    setHideBaseBuilding(true);
  }

  const hasModel = !!activeVersion;
  // Distinct from `hasModel` above ("is there a version row at all,"
  // governing canEdit/publish gating below) — this is specifically "is
  // there an uploaded file to show," for the render section further down
  // that displays file name/size/validation. A version can exist (saved,
  // even published) with no file yet — "save the location before
  // uploading a model."
  const hasFile = !!activeVersion?.publicAssetUrl;
  const previewUrl = localPreviewUrl ?? (activeVersion?.publicAssetUrl || null);
  // "Move location first, then add the 3D model" — before any version
  // exists at all, there's no published state to protect yet, so editing
  // (position, scale, rotation, hide-building) is open from the start
  // rather than locked until a draft exists. Once a model has been
  // uploaded, the usual draft/published rule takes back over.
  const canEdit = isDraftActive || !hasModel;
  // A model anchored somewhere the record isn't — the pre-"one location"
  // split (a model dragged onto the real building while the project row
  // kept a neighbourhood-centroid default, or vice versa). Surfaced rather
  // than silently resolved: whichever of the two is right is a question
  // only an admin can answer, and saving the pin would otherwise drag a
  // correctly-placed model to a wrong coordinate with no warning.
  const modelAnchor =
    activeVersion && (activeVersion.latitude !== location.lat || activeVersion.longitude !== location.lng)
      ? { lat: activeVersion.latitude, lng: activeVersion.longitude }
      : null;
  // The pin is ALWAYS movable — it is the project's location, not part of
  // the model version's draft/published lifecycle (a published GLB sitting
  // at the wrong address still has to be movable without opening a new
  // model draft first).

  return (
    <div className={cn("flex min-h-0 w-full flex-col lg:flex-row", embedded ? "h-[42rem]" : "h-full")}>
      <div className="h-64 shrink-0 bg-neutral-900 lg:h-full lg:flex-1">
        <MapModelMapPreview
          coords={location}
          modelPosition={location}
          glbUrl={previewUrl}
          scale={scale}
          rotationDeg={rotationDeg}
          altitudeOffset={altitudeOffset}
          hideBaseBuilding={hideBaseBuilding}
          hiddenBuildings={hiddenBuildings}
          picking={picking}
          onToggleBuilding={handleToggleBuilding}
          canMoveModel
          onMoveModel={onLocationChange}
          relocating={relocating}
          onRelocate={(point) => {
            onLocationChange(point);
            // One click is the whole action — auto-exit so Admin gets
            // immediate visual confirmation (the marker/model jumping to
            // the new spot) instead of staying in a mode that now reads as
            // "did that work?".
            setRelocating(false);
          }}
        />
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col border-t border-neutral-100 lg:h-full lg:max-w-md lg:border-l lg:border-t-0">
        {/* Dropped entirely when embedded: every part of this row — back
            arrow, title, project name, delete-project — is already in the
            Project Manager's own header and section header a few pixels
            above it. Real "delete a Project" lives here rather than only in
            the admin grid's kebab menu; same audit-logged Recycle Bin
            route, see useDeleteProject.ts. */}
        {!embedded && (
          <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-5 py-4">
            <button
              onClick={onClose}
              aria-label={t("common.back")}
              className="shrink-0 rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-neutral-900">{t("admin.mapModelTitle")}</h2>
              <p className="truncate text-xs text-neutral-500">{project.name}</p>
            </div>
            <button
              onClick={onDeleteProject ?? (() => {})}
              disabled={deletingProject}
              title={t("admin.deleteProjectAction")}
              aria-label={t("admin.deleteProjectAction")}
              className="shrink-0 rounded-control border border-red-200 p-2 text-red-500 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scroll-thin p-5">
            {/* THE project's location — not a model offset. Drag the pin
                (or click "Move location" and then the map) and the record,
                the public search pin, every unit's listing address and
                every map-model version move together; see
                src/lib/projectLocation.ts. Sits ahead of the Upload
                section because "place the site, then add the model" is the
                real order of work, and the pin is usable before anything
                has been uploaded. */}
            <div className="space-y-2 rounded-panel border border-brand-200 bg-brand-50/50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                <MapPin className="h-3.5 w-3.5 text-brand-500" />
                {t("admin.mapModelLocationTitle")}
              </div>
              <p className="text-[11px] leading-snug text-neutral-500">
                {locationNote ?? t("admin.mapModelLocationShared")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <LatLngField
                  label={t("admin.mapModelLatitude")}
                  value={location.lat}
                  min={-90}
                  max={90}
                  onChange={(lat) => onLocationChange({ lat, lng: location.lng })}
                />
                <LatLngField
                  label={t("admin.mapModelLongitude")}
                  value={location.lng}
                  min={-180}
                  max={180}
                  onChange={(lng) => onLocationChange({ lat: location.lat, lng })}
                />
              </div>
              <button
                onClick={() => {
                  // Mutually exclusive with "Pick buildings to remove" —
                  // see that button's own comment.
                  setPicking(false);
                  setRelocating((v) => !v);
                }}
                aria-pressed={relocating}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-control py-2 text-xs font-semibold",
                  relocating
                    ? "bg-brand-500 text-white hover:bg-brand-600"
                    : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100"
                )}
              >
                <Crosshair className="h-3.5 w-3.5" />
                {relocating ? t("admin.mapModelRelocateDone") : t("admin.mapModelRelocate")}
              </button>
              {modelAnchor && (
                <div className="space-y-1.5 rounded-control border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-[11px] font-semibold text-amber-800">{t("admin.mapModelAnchorSplit")}</p>
                  <p className="text-[11px] leading-snug text-amber-700">
                    {t("admin.mapModelAnchorSplitDetail", {
                      lat: modelAnchor.lat.toFixed(6),
                      lng: modelAnchor.lng.toFixed(6),
                    })}
                  </p>
                  <button
                    onClick={() => onLocationChange(modelAnchor)}
                    className="w-full rounded-control border border-amber-300 bg-white py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    {t("admin.mapModelUseModelAnchor")}
                  </button>
                </div>
              )}

              {/* Only when this editor owns persistence (the standalone
                  page). Inside the Project Manager the record's own save
                  bar commits the pin along with everything else. */}
              {onSaveLocation && (
                <button
                  onClick={onSaveLocation}
                  disabled={!locationDirty || savingLocation}
                  className="w-full rounded-control bg-neutral-900 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
                >
                  {savingLocation
                    ? t("common.loading")
                    : locationDirty
                    ? t("admin.mapModelSaveLocation")
                    : t("admin.mapModelLocationSaved")}
                </button>
              )}
            </div>

            <section>
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,model/gltf-binary"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
              {hasModel ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 rounded-panel border border-neutral-200 bg-neutral-50 p-3">
                    <div className="min-w-0">
                      {hasFile ? (
                        <>
                          <p className="truncate text-sm font-semibold text-neutral-800">
                            {activeVersion!.fileName}{" "}
                            <span className="font-normal text-neutral-400">v{activeVersion!.version}</span>
                          </p>
                          <p className="text-xs text-neutral-500">{formatBytes(activeVersion!.fileSize!)}</p>
                        </>
                      ) : (
                        // "Save the location before uploading a model" — a
                        // real, savable (even publishable) version exists,
                        // it just has no file yet.
                        <p className="truncate text-sm font-semibold text-neutral-800">
                          {t("admin.mapModelNoFileYet")}{" "}
                          <span className="font-normal text-neutral-400">v{activeVersion!.version}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!canEdit && activeVersion!.publicationStatus === "published" && (
                        <button
                          onClick={handleEdit}
                          disabled={busy}
                          className="rounded-control bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                        >
                          {t("admin.mapModelEdit")}
                        </button>
                      )}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy}
                        className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-white disabled:opacity-40"
                      >
                        {hasFile ? t("admin.mapModelReplace") : t("admin.mapModelUpload")}
                      </button>
                      {canEdit ? (
                        <button
                          onClick={handleDiscardDraft}
                          disabled={busy}
                          aria-label={t("admin.discardDraft")}
                          className="rounded-control border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        activeVersion!.publicationStatus === "published" && (
                          <button
                            onClick={handleRemoveModel}
                            disabled={busy}
                            aria-label={t("admin.mapModelRemove")}
                            title={t("admin.mapModelRemove")}
                            className="rounded-control border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )
                      )}
                      {/* Real permanent delete, any status — distinct from
                          the soft icon-only actions above (discard-draft /
                          archive-published), which stay as-is. */}
                      <button
                        onClick={handleDeleteModel}
                        disabled={busy}
                        title={t("admin.mapModelDeleteModel")}
                        className="flex items-center gap-1 rounded-control border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("admin.mapModelDeleteModel")}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    {hasFile ? (
                      <ValidationBadge status={activeVersion!.validationStatus} issues={activeVersion!.validationIssues} />
                    ) : (
                      <span className="text-[11px] text-neutral-400">{t("admin.mapModelNoFileYetHint")}</span>
                    )}
                    <span
                      className={cn(
                        "text-[11px] font-semibold",
                        activeVersion!.publicationStatus === "published" ? "text-green-600" : "text-amber-600"
                      )}
                    >
                      {activeVersion!.publicationStatus === "published"
                        ? t("admin.statusPublished")
                        : t("admin.statusDraft")}
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="flex w-full flex-col items-center gap-2 rounded-panel border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-40"
                >
                  <Upload className="h-6 w-6 text-neutral-400" />
                  <span className="text-sm font-semibold text-neutral-700">
                    {t("admin.mapModelUpload")}
                  </span>
                  <span className="text-xs text-neutral-400">{t("admin.mapModelAccepted")}</span>
                </button>
              )}
              {uploadProgress != null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${Math.round(uploadProgress)}%` }}
                  />
                </div>
              )}
              {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
              {warnings.map((warning) => (
                <p key={warning} className="mt-2 rounded-control bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  {warning}
                </p>
              ))}
              <p className="mt-2 text-[11px] text-neutral-400">{t("admin.mapModelStorageNote")}</p>
            </section>

            {!canEdit && hasModel && (
              <p className="rounded-control bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                {t("admin.viewingPublishedNote")}
              </p>
            )}

            <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-50">
              <SliderField
                label={t("admin.mapModelScale")}
                min={0.01}
                max={20}
                step={0.01}
                value={scale}
                onChange={setScale}
                suffix="×"
              />
              <p className="-mt-3 text-[11px] text-neutral-400">{t("admin.mapModelScaleNote")}</p>
              <SliderField
                label={t("admin.mapModelRotation")}
                min={0}
                max={359}
                step={1}
                value={rotationDeg}
                onChange={setRotationDeg}
                suffix="°"
              />
              <SliderField
                label={t("admin.mapModelAltitude")}
                min={-20}
                max={50}
                step={0.5}
                value={altitudeOffset}
                onChange={setAltitudeOffset}
                suffix="m"
              />

              <ToggleField
                label={t("admin.mapModelHideBuilding")}
                checked={hideBaseBuilding}
                onChange={setHideBaseBuilding}
              />
              <p className="-mt-3 text-[11px] text-neutral-400">{t("admin.mapModelHideBuildingNote")}</p>

              {hideBaseBuilding && (
                <div className="space-y-2 rounded-panel border border-neutral-200 bg-neutral-50 p-3">
                  <button
                    onClick={() => {
                      // Mutually exclusive with "Relocate position" — both
                      // modes turn plain map clicks into an action, and
                      // leaving both on at once would make a click do two
                      // conflicting things at once.
                      setRelocating(false);
                      setPicking((v) => !v);
                    }}
                    aria-pressed={picking}
                    className={cn(
                      "flex w-full items-center justify-center gap-1.5 rounded-control py-2 text-xs font-semibold",
                      picking
                        ? "bg-brand-500 text-white hover:bg-brand-600"
                        : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100"
                    )}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    {picking ? t("admin.mapModelPickDone") : t("admin.mapModelPickBuilding")}
                  </button>
                  <p className="text-[11px] text-neutral-400">
                    {picking ? t("admin.mapModelPickHintList") : t("admin.mapModelPickedAuto")}
                  </p>
                  {hiddenBuildings.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-neutral-600">
                          {t("admin.mapModelHiddenCount", { count: hiddenBuildings.length })}
                        </span>
                        <button
                          onClick={() => setHiddenBuildings([])}
                          className="text-[11px] font-semibold text-red-500 hover:underline"
                        >
                          {t("admin.mapModelClearAll")}
                        </button>
                      </div>
                      <ul className="space-y-1">
                        {hiddenBuildings.map((b, i) => (
                          <li
                            key={b.featureId != null ? String(b.featureId) : `${b.lng},${b.lat}`}
                            className="flex items-center justify-between gap-2 rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-600"
                          >
                            <span>{t("admin.mapModelBuildingLabel", { index: i + 1 })}</span>
                            <button
                              onClick={() => setHiddenBuildings((cur) => cur.filter((_, j) => j !== i))}
                              aria-label={t("admin.mapModelRemoveOne")}
                              className="text-neutral-400 hover:text-red-500"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </fieldset>

            <div className="border-t border-neutral-100 pt-4">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wide text-neutral-500"
              >
                <span className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" /> {t("admin.versionHistory")}
                </span>
                <span>{versions.length}</span>
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1.5">
                  {versions.length === 0 && (
                    <p className="text-xs text-neutral-400">{t("admin.noVersionsYet")}</p>
                  )}
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between gap-2 rounded-control border border-neutral-100 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-neutral-700">v{v.version}</span>{" "}
                        <span
                          className={cn(
                            "font-medium",
                            v.publicationStatus === "published"
                              ? "text-green-600"
                              : v.publicationStatus === "draft"
                              ? "text-amber-600"
                              : "text-neutral-400"
                          )}
                        >
                          {t(`admin.status${v.publicationStatus[0].toUpperCase()}${v.publicationStatus.slice(1)}`)}
                        </span>
                        <p className="text-[10px] text-neutral-400">
                          {formatRelativeDate(v.createdAt, locale)}
                        </p>
                      </div>
                      {v.publicationStatus === "archived" && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => handleRollback(v.id)}
                            disabled={busy}
                            className="flex items-center gap-1 rounded-control border border-neutral-200 px-2 py-1 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                          >
                            <RotateCcw className="h-3 w-3" /> {t("admin.rollback")}
                          </button>
                          <button
                            onClick={() => handleDeleteVersion(v)}
                            disabled={busy}
                            aria-label={t("admin.mapModelDeleteModel")}
                            title={t("admin.mapModelDeleteModel")}
                            className="rounded-control border border-red-200 p-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 space-y-2 border-t border-neutral-100 p-4">
            {flash && (
              <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">{flash}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={!canEdit || busy || !loaded}
                className="flex-1 rounded-control border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                {t("admin.saveDraft")}
              </button>
              <button
                onClick={handlePublish}
                disabled={!canEdit || busy || !loaded || activeVersion?.validationStatus === "blocked"}
                className="flex-1 rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
              >
                {t("admin.publish")}
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}

/** A coordinate input that lets Admin type a real number without the
 * field fighting them mid-keystroke. Bound to a local string while
 * focused: a controlled `type="number"` bound straight to the numeric
 * value re-formats on every keypress, so typing "41.32" turns into 41 the
 * moment the decimal point is entered and the pin jumps to the middle of
 * nowhere. Commits on blur (or Enter), clamped to the real coordinate
 * range. */
function LatLngField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);

  function commit() {
    if (text === null) return;
    const parsed = Number(text);
    setText(null);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.min(max, Math.max(min, parsed)));
  }

  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text ?? value.toFixed(6)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-full rounded-control border border-neutral-200 bg-white px-2 py-1.5 text-xs tabular-nums text-neutral-900 focus:border-brand-400 focus:outline-none"
      />
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand-500"
      />
    </label>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-neutral-500">
        {label}
        <span className="font-semibold text-neutral-800">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
    </label>
  );
}
