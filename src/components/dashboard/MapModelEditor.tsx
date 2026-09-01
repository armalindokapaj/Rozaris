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

const MAX_FILE_BYTES = 60 * 1024 * 1024;
const SAME_BUILDING_EPSILON_DEG = 0.00005;

interface VersionRow {
  id: string;
  version: number;
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

function pickActiveVersion(rows: VersionRow[]): VersionRow | null {
  return rows.find((v) => v.publicationStatus !== "archived") ?? null;
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

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
  location: GeoPoint;
  onLocationChange: (point: GeoPoint) => void;
  onSaveLocation?: () => void;
  locationDirty?: boolean;
  savingLocation?: boolean;
  locationNote?: string;
  reloadToken?: unknown;
  onClose?: () => void;
  onDeleteProject?: () => void;
  deletingProject?: boolean;
  embedded?: boolean;
}) {
  const { t, locale } = useT();

  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [relocating, setRelocating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setHideBaseBuilding(active.hideBaseBuilding);
      setHiddenBuildings(active.hiddenBuildings ?? []);
    }
    return rows;
  }

  useEffect(() => {
    let cancelled = false;
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
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(payload);
      });
      const blob = await upload(`project-map-models/${project.id}-${file.name}`, payload, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: (p) => setUploadProgress(p.percentage),
        multipart: true,
      });
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

  async function handleEdit() {
    if (isDraftActive || !activeVersion) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/map-models/${project.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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

  async function handleSaveDraft() {
    if (!canEdit) return;
    if (activeVersion && !isDraftActive) return;
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
  const hasFile = !!activeVersion?.publicAssetUrl;
  const previewUrl = localPreviewUrl ?? (activeVersion?.publicAssetUrl || null);
  const canEdit = isDraftActive || !hasModel;
  const modelAnchor =
    activeVersion && (activeVersion.latitude !== location.lat || activeVersion.longitude !== location.lng)
      ? { lat: activeVersion.latitude, lng: activeVersion.longitude }
      : null;

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
            setRelocating(false);
          }}
        />
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col border-t border-neutral-100 lg:h-full lg:max-w-md lg:border-l lg:border-t-0">
        {                                                                
                                              }
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
            {                                                            
                                     }
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

              {                                                         
                                                                    }
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
                      {                                                    
                                                                  }
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
