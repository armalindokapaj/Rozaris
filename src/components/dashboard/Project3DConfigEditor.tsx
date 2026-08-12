"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, History, RotateCcw, Trash2, Upload } from "lucide-react";
import { defaultProject3DConfig } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { cn, formatRelativeDate } from "@/lib/utils";
import { autoMatchUnitNodes, extractUnitNodeNames } from "@/lib/glbUnitNodes";
import { calcSunriseSunset } from "@/lib/sunPosition";
import {
  GLASS_TIERS,
  MATERIAL_PRESETS,
  QUALITY_PRESET_ORDER,
  QUALITY_TIERS,
  pickDefaultQualityTier,
} from "@/lib/viewerPresets";
import { ThreeProjectViewer } from "@/components/project/ThreeProjectViewer";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import { ValidationBadge } from "./ValidationBadge";
import { SceneExplorerTree } from "./SceneExplorerTree";
import type {
  MaterialPresetId,
  NodeClassification,
  NodeOverride,
  Project,
  Project3DConfig,
  SceneManifestNode,
} from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // keep in sync with api/blob/upload's maximumSizeInBytes

interface UnitLinkRow {
  meshName: string;
  unitId: string;
  mappingStatus: string;
}

interface DetailVersionRow {
  id: string;
  version: number;
  fileName: string;
  fileSize: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  validationStatus: "ready" | "warning" | "blocked";
  validationIssues: string[] | null;
  publicationStatus: "draft" | "published" | "archived";
  publicAssetUrl: string;
  createdAt: string;
  unitLinks: UnitLinkRow[];
  sceneManifest: SceneManifestNode[] | null;
  nodeOverrides: NodeOverride[] | null;
}

const CLASSIFICATION_OPTIONS: NodeClassification[] = ["architecture", "landscape", "interaction", "helper"];
const MATERIAL_PRESET_OPTIONS: MaterialPresetId[] = Object.keys(MATERIAL_PRESETS) as MaterialPresetId[];

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatUTCHour(h: number): string {
  const hour = Math.floor(h) % 24;
  const minutes = Math.round((h - Math.floor(h)) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")} UTC`;
}

/**
 * Admin's "Project > 3D Experience" authoring surface — rendered as a
 * dedicated full page (`/admin/3d-experience/[projectId]/page.tsx`), not a
 * modal; `onClose` is that page's "go back to the admin console" action,
 * not a dialog dismiss. Two independent things live in one panel:
 * - Rendering/Quality/Lighting&Sun/Glass/Camera ("3D Experience Phase 1")
 *   — real, Postgres-backed (`/api/project-3d-config/[projectId]`),
 *   replacing the old Zustand-only, 100%-dead `Project3DConfig` table.
 *   Presets up front, an "Advanced Settings" toggle for the read-only
 *   technical numbers each preset actually maps to — no raw sliders that
 *   don't persist anywhere (every preset tier here is a real, fixed table
 *   in src/lib/viewerPresets.ts, not independently overridable per-project
 *   yet; that's the honest Phase 1 scope, not a rendering-internals editor).
 * - The Detailed GLB itself (PRD_Admin_3D_Project_Experience) — unchanged
 *   by this pass, still the real versioned pipeline
 *   (src/app/api/detail-models/[projectId]/versions/**) with server-side
 *   validation, draft/publish/rollback and carried unit mappings.
 */
export function Project3DConfigEditor({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Project3DConfig>(defaultProject3DConfig);
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
        setDraft(next);
      })
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // --- Detailed GLB (versioned) ---
  const [versions, setVersions] = useState<DetailVersionRow[]>([]);
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const localPreviewUrlRef = useRef<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailFlash, setDetailFlash] = useState<string | null>(null);
  const [detectedNodes, setDetectedNodes] = useState<string[] | null>(null);
  const [nodesLoading, setNodesLoading] = useState(false);
  // meshName -> unitId ("" = intentionally left unlinked)
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [carriedMeshNames, setCarriedMeshNames] = useState<Set<string>>(new Set());
  const [showOnlyNeedsReview, setShowOnlyNeedsReview] = useState(false);
  // Scene Explorer (Editor UX & Scene Structure pass) — sceneManifest is
  // read-only, regenerated server-side on every upload; nodeOverrides is
  // Admin's own editable state, keyed by rzNodeId, seeded from the active
  // version and saved back alongside scale/rotation/links (see
  // handleSaveDetailModel below).
  const [sceneManifest, setSceneManifest] = useState<SceneManifestNode[]>([]);
  const [nodeOverrides, setNodeOverrides] = useState<Record<string, NodeOverride>>({});
  const [selectedNodeRzId, setSelectedNodeRzId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [altitudeOffset, setAltitudeOffset] = useState(0);
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
      setScale(active.scale);
      setRotationDeg(active.rotationDeg);
      setAltitudeOffset(active.altitudeOffset);
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
      setLinkSelections(selections);
      setCarriedMeshNames(carried);
      setSceneManifest(active.sceneManifest ?? []);
      setNodeOverrides(
        Object.fromEntries((active.nodeOverrides ?? []).map((o) => [o.rzNodeId, o]))
      );
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

  const activeVersion = versions[0] ?? null;
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
      const message = err instanceof Error ? err.message : "";
      setDetailError(
        message.includes("Not authorized") || message.includes("authoriz")
          ? t("admin.sessionExpiredNote")
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

  function update(partial: Partial<Project3DConfig>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  async function handleSaveScene() {
    setConfigBusy(true);
    setConfigError(null);
    try {
      const res = await fetch(`/api/project-3d-config/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: Project3DConfig = await res.json();
      setDraft(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch {
      setConfigError(t("admin.sceneSaveFailed"));
    } finally {
      setConfigBusy(false);
    }
  }

  function handleReset() {
    setDraft(defaultProject3DConfig);
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
  const selectedNode = sceneManifest.find((n) => n.rzNodeId === selectedNodeRzId) ?? null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      <div className="h-64 shrink-0 bg-neutral-900 lg:h-full lg:flex-1">
        <ThreeProjectViewer
          ref={viewerRef}
          project={project}
          config={draft}
          showChrome={false}
          showPerfStats
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
            <h2 className="text-base font-bold text-neutral-900">{t("admin.viewer3DTitle")}</h2>
            <p className="truncate text-xs text-neutral-500">{project.name}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto scroll-thin p-5">
            {/* --- Rendering & Quality --- */}
            <section>
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                {t("admin.sceneRenderingTitle")}
              </h3>
              <div className="space-y-3">
                <SelectField
                  label={t("admin.sceneRenderingMode")}
                  value={draft.renderingMode}
                  onChange={(v) => update({ renderingMode: v as Project3DConfig["renderingMode"] })}
                  options={[
                    ["auto", t("admin.sceneRenderingModeAuto")],
                    ["webgpu", t("admin.sceneRenderingModeWebgpu")],
                    ["webgl2", t("admin.sceneRenderingModeWebgl2")],
                  ]}
                />
                <SelectField
                  label={t("admin.sceneQualityPreset")}
                  value={draft.qualityPreset}
                  onChange={(v) => update({ qualityPreset: v as Project3DConfig["qualityPreset"] })}
                  options={QUALITY_PRESET_ORDER.map(
                    (id): [string, string] => [id, t(`admin.sceneQuality_${id}`)]
                  )}
                />
                <p className="text-[11px] text-neutral-400">
                  {t("admin.sceneQualitySuggested", { tier: t(`admin.sceneQuality_${suggestedTier}`) })}
                </p>
              </div>
            </section>

            {/* --- Lighting & Sun --- */}
            <section className="border-t border-neutral-100 pt-5">
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                {t("admin.sceneLightingTitle")}
              </h3>
              <div className="space-y-3">
                <SelectField
                  label={t("admin.sceneSkyPreset")}
                  value={draft.skyPreset}
                  onChange={(v) => update({ skyPreset: v as Project3DConfig["skyPreset"] })}
                  options={[
                    ["clear_day", t("admin.sceneSkyClearDay")],
                    ["soft_day", t("admin.sceneSkySoftDay")],
                    ["overcast", t("admin.sceneSkyOvercast")],
                    ["golden_hour", t("admin.sceneSkyGoldenHour")],
                    ["evening", t("admin.sceneSkyEvening")],
                  ]}
                />
                <SelectField
                  label={t("admin.sceneBackgroundPreset")}
                  value={draft.backgroundPreset}
                  onChange={(v) => update({ backgroundPreset: v as Project3DConfig["backgroundPreset"] })}
                  options={[
                    ["sky", t("admin.sceneBackgroundSky")],
                    ["studio_light", t("admin.sceneBackgroundStudioLight")],
                    ["studio_dark", t("admin.sceneBackgroundStudioDark")],
                  ]}
                />
                <p className="text-[11px] text-neutral-400">{t("admin.sceneBackgroundNote")}</p>
                <SliderField
                  label={t("admin.sceneEnvironmentIntensity")}
                  min={0}
                  max={3}
                  step={0.05}
                  value={draft.environmentIntensity}
                  onChange={(v) => update({ environmentIntensity: v })}
                  suffix="×"
                />
                <SliderField
                  label={t("admin.sceneExposure")}
                  min={0}
                  max={3}
                  step={0.05}
                  value={draft.exposure}
                  onChange={(v) => update({ exposure: v })}
                  suffix="×"
                />
                <SliderField
                  label={t("admin.sceneNorthRotation")}
                  min={-180}
                  max={180}
                  step={1}
                  value={draft.northRotationDeg}
                  onChange={(v) => update({ northRotationDeg: v })}
                  suffix="°"
                />
                <SliderField
                  label={t("admin.sceneDefaultTime")}
                  min={0}
                  max={24}
                  step={0.5}
                  value={draft.defaultTimeOfDay}
                  onChange={(v) => update({ defaultTimeOfDay: v })}
                />
                <ToggleField
                  label={t("admin.sceneAllowUserTime")}
                  checked={draft.allowUserTimeChange}
                  onChange={(v) => update({ allowUserTimeChange: v })}
                />
                {sunTimes && (
                  <p className="text-[11px] text-neutral-400">
                    {t("admin.sceneSunTimes", {
                      sunrise: formatUTCHour(sunTimes.sunriseHourUTC),
                      sunset: formatUTCHour(sunTimes.sunsetHourUTC),
                    })}
                  </p>
                )}
              </div>
            </section>

            {/* --- Glass --- */}
            <section className="border-t border-neutral-100 pt-5">
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                {t("admin.sceneGlassTitle")}
              </h3>
              <SelectField
                label={t("admin.sceneGlassPreset")}
                value={draft.glassPreset}
                onChange={(v) => update({ glassPreset: v as Project3DConfig["glassPreset"] })}
                options={[
                  ["performance", t("admin.sceneGlassPerformance")],
                  ["standard", t("admin.sceneGlassStandard")],
                  ["premium", t("admin.sceneGlassPremium")],
                ]}
              />
              <p className="mt-1.5 text-[11px] text-neutral-400">{t("admin.sceneGlassNote")}</p>
            </section>

            {/* --- Camera --- */}
            <section className="border-t border-neutral-100 pt-5">
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                {t("admin.sceneCameraTitle")}
              </h3>
              <div className="space-y-3">
                <ToggleField
                  label={t("admin.viewer3DGround")}
                  checked={draft.groundEnabled}
                  onChange={(v) => update({ groundEnabled: v })}
                />
                <ToggleField
                  label={t("admin.viewer3DAutoRotate")}
                  checked={draft.autoRotate}
                  onChange={(v) => update({ autoRotate: v })}
                />
                <ToggleField
                  label={t("admin.viewer3DConstructionStages")}
                  checked={draft.constructionStagesEnabled}
                  onChange={(v) => update({ constructionStagesEnabled: v })}
                />
                <SliderField
                  label={t("admin.viewer3DCameraStart")}
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={draft.cameraStartDistanceMultiplier}
                  onChange={(v) => update({ cameraStartDistanceMultiplier: v })}
                />
                <SliderField
                  label={t("admin.viewer3DCameraMin")}
                  min={0.1}
                  max={1.5}
                  step={0.05}
                  value={draft.cameraMinDistanceMultiplier}
                  onChange={(v) => update({ cameraMinDistanceMultiplier: v })}
                />
                <SliderField
                  label={t("admin.viewer3DCameraMax")}
                  min={1}
                  max={5}
                  step={0.1}
                  value={draft.cameraMaxDistanceMultiplier}
                  onChange={(v) => update({ cameraMaxDistanceMultiplier: v })}
                />
                <SliderField
                  label={t("admin.viewer3DMaxPolar")}
                  min={40}
                  max={110}
                  step={1}
                  value={draft.cameraMaxPolarDeg}
                  onChange={(v) => update({ cameraMaxPolarDeg: v })}
                  suffix="°"
                />
                <SliderField
                  label={t("admin.sceneCameraFovDesktop")}
                  min={20}
                  max={70}
                  step={1}
                  value={draft.cameraFovDesktop}
                  onChange={(v) => update({ cameraFovDesktop: v })}
                  suffix="°"
                />
                <SliderField
                  label={t("admin.sceneCameraFovMobile")}
                  min={20}
                  max={70}
                  step={1}
                  value={draft.cameraFovMobile}
                  onChange={(v) => update({ cameraFovMobile: v })}
                  suffix="°"
                />
              </div>
            </section>

            {/* --- Camera Presets --- */}
            <section className="border-t border-neutral-100 pt-5">
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                {t("admin.sceneCameraPresetsTitle")}
              </h3>
              {draft.cameraPresets.length === 0 ? (
                <p className="mb-2.5 text-[11px] text-neutral-400">{t("admin.sceneCameraPresetsEmpty")}</p>
              ) : (
                <div className="mb-2.5 space-y-1.5">
                  {draft.cameraPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between gap-2 rounded-control border border-neutral-100 px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-neutral-800">{preset.label}</span>
                      <button
                        onClick={() =>
                          update({ cameraPresets: draft.cameraPresets.filter((p) => p.id !== preset.id) })
                        }
                        aria-label={t("common.close")}
                        className="rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  value={newPresetLabel}
                  onChange={(e) => setNewPresetLabel(e.target.value)}
                  placeholder={t("admin.sceneCameraPresetLabelPlaceholder")}
                  className="min-w-0 flex-1 rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                />
                <button
                  onClick={() => {
                    const state = viewerRef.current?.getCameraState();
                    const label = newPresetLabel.trim();
                    if (!state || !label) return;
                    update({
                      cameraPresets: [
                        ...draft.cameraPresets,
                        { id: `preset-${Date.now()}`, label, ...state, durationMs: 900 },
                      ],
                    });
                    setNewPresetLabel("");
                  }}
                  disabled={!newPresetLabel.trim()}
                  className="shrink-0 rounded-control bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                >
                  {t("admin.sceneCameraPresetSaveCurrent")}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-400">{t("admin.sceneCameraPresetNote")}</p>
            </section>

            {/* --- Viewer UI --- */}
            <section className="border-t border-neutral-100 pt-5">
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
                {t("admin.sceneViewerUITitle")}
              </h3>
              <div className="space-y-3">
                <ToggleField
                  label={t("project.home")}
                  checked={draft.viewerUI.home}
                  onChange={(v) => update({ viewerUI: { ...draft.viewerUI, home: v } })}
                />
                <ToggleField
                  label={t("unit.viewerUnitSearch")}
                  checked={draft.viewerUI.unitSearch}
                  onChange={(v) => update({ viewerUI: { ...draft.viewerUI, unitSearch: v } })}
                />
                <ToggleField
                  label={t("project.timeOfDay")}
                  checked={draft.viewerUI.timeOfDay}
                  onChange={(v) => update({ viewerUI: { ...draft.viewerUI, timeOfDay: v } })}
                />
                <ToggleField
                  label={t("project.viewPreset")}
                  checked={draft.viewerUI.viewPreset}
                  onChange={(v) => update({ viewerUI: { ...draft.viewerUI, viewPreset: v } })}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-400">{t("admin.sceneViewerUINote")}</p>
            </section>

            {/* --- Advanced Settings — read-only: every number below comes
                from the selected preset tier (src/lib/viewerPresets.ts),
                not an independent per-project override yet. Shown so Admin
                can see what a preset actually does, not as fake controls. --- */}
            <section className="border-t border-neutral-100 pt-4">
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wide text-neutral-500"
              >
                <span>{t("admin.sceneAdvancedTitle")}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
              </button>
              {advancedOpen && (
                <div className="mt-3 space-y-3 rounded-panel border border-neutral-100 bg-neutral-50 p-3 text-xs text-neutral-600">
                  <div>
                    <p className="font-semibold text-neutral-700">{t("admin.sceneAdvancedRendering")}</p>
                    <p>
                      {t("admin.sceneAdvancedRenderScale", {
                        value: Math.round(QUALITY_TIERS[draft.qualityPreset].renderScale * 100),
                      })}{" "}
                      · {t("admin.sceneAdvancedDprCap", { value: QUALITY_TIERS[draft.qualityPreset].dprCap })} ·{" "}
                      {t("admin.sceneAdvancedShadowRes", {
                        value: QUALITY_TIERS[draft.qualityPreset].shadowMapSize,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-700">{t("admin.sceneAdvancedGlass")}</p>
                    <p>
                      {t("admin.sceneAdvancedTransmission", {
                        value: GLASS_TIERS[draft.glassPreset].transmission,
                      })}{" "}
                      · {t("admin.sceneAdvancedRoughness", { value: GLASS_TIERS[draft.glassPreset].roughness })} ·{" "}
                      {t("admin.sceneAdvancedIor", { value: GLASS_TIERS[draft.glassPreset].ior })}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <div className="flex gap-2 border-t border-neutral-100 pt-4">
              <button
                onClick={handleReset}
                disabled={configBusy}
                className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("admin.viewer3DReset")}
              </button>
              <button
                onClick={handleSaveScene}
                disabled={configBusy || !configLoaded}
                className="flex-1 rounded-control bg-neutral-900 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
              >
                {t("admin.viewer3DSave")}
              </button>
            </div>
            {savedFlash && (
              <p className="-mt-2 rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                {t("admin.viewer3DSaved")}
              </p>
            )}
            {configError && <p className="-mt-2 text-xs font-medium text-red-600">{configError}</p>}

            <div className="border-t border-neutral-100 pt-5">
              <h3 className="mb-1 text-sm font-bold text-neutral-900">{t("admin.detailModelTitle")}</h3>
              <p className="mb-3 text-xs text-neutral-500">{t("admin.detailModelSubtitle")}</p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,model/gltf-binary"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleDetailFile(file);
                  e.target.value = "";
                }}
              />
              {hasDetailModel ? (
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
                        disabled={detailBusy}
                        className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-white disabled:opacity-40"
                      >
                        {t("admin.detailModelReplace")}
                      </button>
                      {canEditDetail ? (
                        <button
                          onClick={handleDiscardDraft}
                          disabled={detailBusy}
                          aria-label={t("admin.discardDraft")}
                          className="rounded-control border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        activeVersion!.publicationStatus === "published" && (
                          <button
                            onClick={handleRemoveDetailModel}
                            disabled={detailBusy}
                            aria-label={t("admin.detailModelRemove")}
                            title={t("admin.detailModelRemove")}
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
                  disabled={detailBusy}
                  className="flex w-full flex-col items-center gap-2 rounded-panel border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-40"
                >
                  <Upload className="h-6 w-6 text-neutral-400" />
                  <span className="text-sm font-semibold text-neutral-700">{t("admin.detailModelUpload")}</span>
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
              {detailError && <p className="mt-2 text-xs font-medium text-red-600">{detailError}</p>}
              {!canEditDetail && hasDetailModel && (
                <p className="mt-2 rounded-control bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  {t("admin.viewingPublishedNote")}
                </p>
              )}

              {hasDetailModel && (
                <fieldset disabled={!canEditDetail} className="mt-4 space-y-4 disabled:opacity-50">
                  <SliderField
                    label={t("admin.detailModelScale")}
                    min={0.01}
                    max={20}
                    step={0.01}
                    value={scale}
                    onChange={setScale}
                    suffix="×"
                  />
                  <p className="-mt-2 text-[11px] text-neutral-400">{t("admin.mapModelScaleNote")}</p>
                  <SliderField
                    label={t("admin.detailModelRotation")}
                    min={0}
                    max={359}
                    step={1}
                    value={rotationDeg}
                    onChange={setRotationDeg}
                    suffix="°"
                  />
                  <SliderField
                    label={t("admin.detailModelAltitude")}
                    min={-20}
                    max={50}
                    step={0.5}
                    value={altitudeOffset}
                    onChange={setAltitudeOffset}
                    suffix="m"
                  />
                </fieldset>
              )}

              {hasDetailModel && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                      {t("admin.detailModelLinkUnitsTitle")}
                    </h4>
                    {detectedNodes && (
                      <span className="text-xs font-medium text-neutral-500">
                        {t("admin.detailModelLinkSummary", {
                          detected: detectedNodes.length,
                          matched: matchedCount,
                          needsReview: needsReviewCount,
                        })}
                      </span>
                    )}
                  </div>

                  {!nodesLoading && detectedNodes && detectedNodes.length > 0 && (
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!canEditDetail}
                        onClick={() =>
                          setLinkSelections((s) => autoMatchUnitNodes(detectedNodes, project.units, s))
                        }
                        className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {t("admin.detailModelAutoMatch")}
                      </button>
                      <button
                        type="button"
                        aria-pressed={showOnlyNeedsReview}
                        onClick={() => setShowOnlyNeedsReview((v) => !v)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          showOnlyNeedsReview
                            ? "border-brand-300 bg-brand-50 text-brand-700"
                            : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                        )}
                      >
                        {t("admin.detailModelShowNeedsReview")}
                      </button>
                    </div>
                  )}

                  {nodesLoading && (
                    <p className="text-xs text-neutral-400">{t("admin.detailModelDetecting")}</p>
                  )}
                  {!nodesLoading && detectedNodes && detectedNodes.length === 0 && (
                    <p className="text-xs text-neutral-400">{t("admin.detailModelNoNodes")}</p>
                  )}
                  {!nodesLoading && detectedNodes && detectedNodes.length > 0 && (
                    <div className="space-y-2">
                      {visibleNodes.map((meshName) => (
                        <div key={meshName} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate font-mono text-xs text-neutral-600">
                            {meshName}
                          </span>
                          <select
                            disabled={!canEditDetail}
                            value={linkSelections[meshName] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setLinkSelections((s) => ({ ...s, [meshName]: value }));
                              // A manual choice is a real review, even for a
                              // node that was only ever auto-"carried" —
                              // without this the amber badge would stay
                              // stuck forever once carried, regardless of
                              // what Admin does with the dropdown next.
                              setCarriedMeshNames((s) => {
                                if (!s.has(meshName)) return s;
                                const next = new Set(s);
                                next.delete(meshName);
                                return next;
                              });
                            }}
                            className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none disabled:opacity-50"
                          >
                            <option value="">{t("admin.detailModelUnlinked")}</option>
                            {project.units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.code} · {t("admin.detailModelFloorLabel", { floor: u.floor })} ·{" "}
                                {t(`unit.status${u.status[0].toUpperCase()}${u.status.slice(1)}`)}
                              </option>
                            ))}
                          </select>
                          {!linkSelections[meshName] ? (
                            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                              {t("admin.mappingNeedsReview")}
                            </span>
                          ) : (
                            carriedMeshNames.has(meshName) && (
                              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                {t("admin.mappingCarried")}
                              </span>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {hasDetailModel && sceneManifest.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
                    {t("admin.sceneExplorerTitle")}
                  </h4>
                  <div className="rounded-control border border-neutral-200 p-1.5">
                    <SceneExplorerTree
                      manifest={sceneManifest}
                      selectedRzNodeId={selectedNodeRzId}
                      onSelect={setSelectedNodeRzId}
                      overriddenSet={new Set(Object.keys(nodeOverrides))}
                      classificationOf={(node) => {
                        const override = nodeOverrides[node.rzNodeId];
                        if (override?.classification) return override.classification;
                        if (linkedMeshNames.has(node.name)) return "unit_block";
                        return node.autoClassification;
                      }}
                    />
                  </div>

                  {selectedNode && (
                    <div className="mt-2 space-y-2.5 rounded-control border border-brand-200 bg-brand-50/30 p-3">
                      <p className="truncate font-mono text-xs font-semibold text-neutral-700">
                        {selectedNode.name}
                      </p>

                      {linkedMeshNames.has(selectedNode.name) ? (
                        <p className="text-[11px] text-neutral-500">{t("admin.sceneExplorerUnitBlockNote")}</p>
                      ) : (
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                            {t("admin.sceneExplorerClassification")}
                          </span>
                          <select
                            disabled={!canEditDetail}
                            value={nodeOverrides[selectedNode.rzNodeId]?.classification ?? selectedNode.autoClassification}
                            onChange={(e) => {
                              const classification = e.target.value as NodeClassification;
                              setNodeOverrides((s) => ({
                                ...s,
                                [selectedNode.rzNodeId]: {
                                  ...(s[selectedNode.rzNodeId] ?? { rzNodeId: selectedNode.rzNodeId }),
                                  classification,
                                },
                              }));
                            }}
                            className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none disabled:opacity-50"
                          >
                            {CLASSIFICATION_OPTIONS.map((c) => (
                              <option key={c} value={c}>
                                {t(`admin.sceneExplorerClass_${c}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <label className="block">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                          {t("admin.sceneExplorerMaterialPreset")}
                        </span>
                        <select
                          disabled={!canEditDetail}
                          value={nodeOverrides[selectedNode.rzNodeId]?.materialPreset ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setNodeOverrides((s) => ({
                              ...s,
                              [selectedNode.rzNodeId]: {
                                ...(s[selectedNode.rzNodeId] ?? { rzNodeId: selectedNode.rzNodeId }),
                                materialPreset: value ? (value as MaterialPresetId) : undefined,
                              },
                            }));
                          }}
                          className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none disabled:opacity-50"
                        >
                          <option value="">{t("admin.sceneExplorerOriginalMaterial")}</option>
                          {MATERIAL_PRESET_OPTIONS.map((id) => (
                            <option key={id} value={id}>
                              {t(`admin.materialPreset_${id}`)}
                            </option>
                          ))}
                        </select>
                      </label>

                      {nodeOverrides[selectedNode.rzNodeId] && (
                        <button
                          type="button"
                          disabled={!canEditDetail}
                          onClick={() =>
                            setNodeOverrides((s) => {
                              const next = { ...s };
                              delete next[selectedNode.rzNodeId];
                              return next;
                            })
                          }
                          className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
                        >
                          {t("admin.sceneExplorerResetToOriginal")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {detailFlash && (
                <p className="mt-3 rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                  {detailFlash}
                </p>
              )}

              {hasDetailModel && (
                <div className="mt-4 space-y-1 rounded-control border border-neutral-200 bg-neutral-50 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                    {t("admin.publishChecklistTitle")}
                  </p>
                  <ChecklistRow
                    status={activeVersion!.validationStatus === "blocked" ? "warn" : "ok"}
                    label={t(`admin.validation${activeVersion!.validationStatus[0].toUpperCase()}${activeVersion!.validationStatus.slice(1)}`)}
                  />
                  <ChecklistRow
                    status={needsReviewCount === 0 ? "ok" : "warn"}
                    label={t("admin.publishChecklistUnits", { matched: matchedCount, needsReview: needsReviewCount })}
                  />
                  <ChecklistRow
                    status="info"
                    label={t("admin.publishChecklistOverrides", { count: Object.keys(nodeOverrides).length })}
                  />
                </div>
              )}

              {hasDetailModel && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={handleDetailSave}
                    disabled={!canEditDetail || detailBusy || !detailLoaded}
                    className="flex-1 rounded-control border border-neutral-200 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                  >
                    {t("admin.saveDraft")}
                  </button>
                  <button
                    onClick={handleDetailPublish}
                    disabled={!canEditDetail || detailBusy || !detailLoaded || activeVersion?.validationStatus === "blocked"}
                    className="flex-1 rounded-control bg-brand-500 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                  >
                    {t("admin.publish")}
                  </button>
                </div>
              )}

              <div className="mt-4">
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
                            onClick={() => handleDetailRollback(v.id)}
                            disabled={detailBusy}
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
          </div>
        </div>
      </div>
  );

}

/** One row of the pre-publish checklist (Publish/runtime hardening pass)
 * — informational, doesn't itself gate anything; the real publish gate
 * stays server-side (422 on `validationStatus === "blocked"`, unchanged). */
function ChecklistRow({ status, label }: { status: "ok" | "warn" | "info"; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status === "ok" && <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />}
      {status === "warn" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
      {status === "info" && <span className="h-3.5 w-3.5 shrink-0" />}
      <span className="text-neutral-600">{label}</span>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
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
