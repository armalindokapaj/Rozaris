"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ArrowLeft, Crosshair, History, MapPin, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn, formatRelativeDate } from "@/lib/utils";
import { MapModelMapPreview, type HiddenBuildingEntry } from "./MapModelMapPreview";
import { ValidationBadge } from "./ValidationBadge";
import type { BuildingFootprint } from "@/components/map/BuildingHider";
import type { Project } from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // keep in sync with api/blob/upload's maximumSizeInBytes
// Two picked buildings within this many degrees of each other are treated
// as "the same building" for toggle-off purposes when neither has a usable
// feature id — roughly 5m at Tirana's latitude.
const SAME_BUILDING_EPSILON_DEG = 0.00005;

interface VersionRow {
  id: string;
  version: number;
  fileName: string;
  fileSize: number;
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
  publicAssetUrl: string;
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
 * pick, and un-pick, several real buildings), and the model's own position
 * is now draggable in the preview instead of being locked to the project's
 * exact coordinates — see MapModelMapPreview.tsx and BuildingHider.ts for
 * the mechanics.
 */
export function MapModelEditor({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t, locale } = useT();

  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable placement — synced from the active draft (or the published
  // version, read-only, if there's no draft to edit) whenever the version
  // list changes underneath it.
  const [scale, setScale] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [altitudeOffset, setAltitudeOffset] = useState(0);
  const [longitude, setLongitude] = useState(project.coords.lng);
  const [latitude, setLatitude] = useState(project.coords.lat);
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
      setLongitude(active.longitude ?? project.coords.lng);
      setLatitude(active.latitude ?? project.coords.lat);
      setHideBaseBuilding(active.hideBaseBuilding);
      setHiddenBuildings(active.hiddenBuildings ?? []);
    }
    return rows;
  }

  useEffect(() => {
    let cancelled = false;
    // Initial version-history load, guarded by `cancelled` like every other
    // fetch effect in this app (see e.g. useProjectDetailModel.ts).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

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
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setBusy(true);
    setUploadProgress(0);
    try {
      const blob = await upload(`project-map-models/${project.id}-${file.name}`, file, {
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
      const res = await fetch(`/api/map-models/${project.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          glbUrl: blob.url,
          fileName: file.name,
          fileSize: file.size,
          scale,
          rotationDeg,
          altitudeOffset,
          longitude,
          latitude,
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
    } catch {
      setError(t("admin.mapModelDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDraft() {
    if (!isDraftActive || !activeVersion) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/map-models/${project.id}/versions/${activeVersion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scale,
          rotationDeg,
          altitudeOffset,
          longitude,
          latitude,
          hideBaseBuilding,
          hiddenBuildings,
        }),
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
    if (!isDraftActive || !activeVersion) return;
    setBusy(true);
    setError(null);
    try {
      await handleSaveDraft();
      const res = await fetch(`/api/map-models/${project.id}/versions/${activeVersion.id}/publish`, {
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
  const previewUrl = localPreviewUrl ?? (activeVersion?.publicAssetUrl || null);
  const canEdit = isDraftActive;
  const positionMoved =
    Math.abs(longitude - project.coords.lng) > 1e-9 || Math.abs(latitude - project.coords.lat) > 1e-9;

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      <div className="h-64 shrink-0 bg-neutral-900 lg:h-full lg:flex-1">
        <MapModelMapPreview
          coords={project.coords}
          modelPosition={{ lng: longitude, lat: latitude }}
          glbUrl={previewUrl}
          scale={scale}
          rotationDeg={rotationDeg}
          altitudeOffset={altitudeOffset}
          hideBaseBuilding={hideBaseBuilding}
          hiddenBuildings={hiddenBuildings}
          picking={picking}
          onToggleBuilding={handleToggleBuilding}
          canMoveModel={canEdit}
          onMoveModel={(point) => {
            setLongitude(point.lng);
            setLatitude(point.lat);
          }}
        />
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col border-t border-neutral-100 lg:h-full lg:max-w-md lg:border-l lg:border-t-0">
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-5 py-4">
          <button
            onClick={onClose}
            aria-label={t("common.back")}
            className="shrink-0 rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-neutral-900">{t("admin.mapModelTitle")}</h2>
            <p className="truncate text-xs text-neutral-500">{project.name}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scroll-thin p-5">
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
                      <p className="truncate text-sm font-semibold text-neutral-800">
                        {activeVersion!.fileName}{" "}
                        <span className="font-normal text-neutral-400">v{activeVersion!.version}</span>
                      </p>
                      <p className="text-xs text-neutral-500">{formatBytes(activeVersion!.fileSize)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy}
                        className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-white disabled:opacity-40"
                      >
                        {t("admin.mapModelReplace")}
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
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <ValidationBadge status={activeVersion!.validationStatus} issues={activeVersion!.validationIssues} />
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
              <p className="mt-2 text-[11px] text-neutral-400">{t("admin.mapModelStorageNote")}</p>
            </section>

            {!canEdit && hasModel && (
              <p className="rounded-control bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                {t("admin.viewingPublishedNote")}
              </p>
            )}

            <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-50">
              {hasModel && (
                <div className="flex items-center justify-between gap-2 rounded-panel border border-neutral-200 bg-neutral-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                    <MapPin className="h-3.5 w-3.5 text-brand-500" />
                    {t("admin.mapModelPositionHint")}
                  </div>
                  {positionMoved && (
                    <button
                      onClick={() => {
                        setLongitude(project.coords.lng);
                        setLatitude(project.coords.lat);
                      }}
                      className="shrink-0 text-[11px] font-semibold text-red-500 hover:underline"
                    >
                      {t("admin.mapModelResetPosition")}
                    </button>
                  )}
                </div>
              )}

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
                    onClick={() => setPicking((v) => !v)}
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
                        <button
                          onClick={() => handleRollback(v.id)}
                          disabled={busy}
                          className="flex shrink-0 items-center gap-1 rounded-control border border-neutral-200 px-2 py-1 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                        >
                          <RotateCcw className="h-3 w-3" /> {t("admin.rollback")}
                        </button>
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
