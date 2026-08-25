"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Archive, Boxes, Map as MapIcon, FileWarning } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn, formatBytes, formatRelativeDate } from "@/lib/utils";
import { useSection, DashboardCard } from "./dashboardKit";
import { downloadAdminAsset, pickCurrentFile } from "@/lib/admin3dAssetView";
import type { AdminAssetFile, AdminAssetGroup, AdminAssetProject } from "@/lib/admin3dAssets";

interface AssetInventory {
  projects: AdminAssetProject[];
  totalProjects: number;
  totalFiles: number;
  totalBytes: number;
}

/**
 * 3D Health → "Project 3D files". The tab already reports what is *wrong*
 * with the platform's 3D assets (blocked uploads, stuck drafts, unmapped
 * units); this is the one place an admin can actually get the files back
 * out — per version, or a whole project as one `.zip`.
 *
 * Every project holding a GLB is listed, not only unhealthy ones — an
 * admin fetching a model has no reason to care whether that project
 * happens to have a health problem, and a health-filtered list would hide
 * most of the platform.
 *
 * Transfers go through `/api/admin/3d-assets/download` and `.../bundle`
 * rather than linking at Vercel Blob directly, so the store URLs never
 * reach the browser and every download is audit-logged. Downloads are
 * issued with `fetch` + an object URL rather than a bare `<a href>` so a
 * failure (429, 502, an expired session) surfaces as an inline message
 * instead of navigating the admin away from the console into a raw JSON
 * error body.
 */
export function Admin3DFilesPanel() {
  const { t } = useT();
  const inventory = useSection<AssetInventory>("/api/admin/3d-assets");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const projects = useMemo(() => {
    const all = inventory.data?.projects ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (p) => p.projectName.toLowerCase().includes(needle) || p.projectSlug.toLowerCase().includes(needle)
    );
  }, [inventory.data, query]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Wraps the shared transfer helper in this panel's own single-flight
   *  busy/failed keys, so exactly one control at a time reports itself as
   *  preparing and a failure lands on the row that caused it. */
  async function download(url: string, key: string, fallbackName: string) {
    setBusy(key);
    setFailed(null);
    try {
      await downloadAdminAsset(url, fallbackName);
    } catch {
      setFailed(key);
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardCard
      title={t("admin.health3d.filesTitle")}
      loading={inventory.loading}
      error={inventory.error}
      onRetry={inventory.reload}
      action={
        inventory.data ? (
          <span className="shrink-0 text-[11px] text-neutral-400">
            {t("admin.health3d.filesSummary", {
              files: inventory.data.totalFiles,
              size: formatBytes(inventory.data.totalBytes),
            })}
          </span>
        ) : undefined
      }
    >
      {inventory.data && (
        <>
          <p className="mb-3 text-[11px] text-neutral-400">{t("admin.health3d.filesNote")}</p>

          {inventory.data.projects.length > 3 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("admin.health3d.filesSearch")}
              className="mb-3 w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none"
            />
          )}

          {inventory.data.projects.length === 0 ? (
            <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
              {t("admin.health3d.filesEmpty")}
            </p>
          ) : projects.length === 0 ? (
            <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
              {t("admin.health3d.filesNoMatch")}
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-1 overflow-y-auto scroll-thin pr-1">
              {projects.map((project) => {
                const open = expanded.has(project.projectId);
                const bundleKey = `bundle:${project.projectId}`;
                const allKey = `bundle-all:${project.projectId}`;
                return (
                  <li key={project.projectId} className="rounded-control border border-neutral-200">
                    <div className="flex items-center gap-2 px-2 py-2">
                      <button
                        onClick={() => toggle(project.projectId)}
                        aria-expanded={open}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {open ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                        )}
                        <span className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-neutral-900">{project.projectName}</p>
                          <p className="truncate text-[11px] text-neutral-400">
                            {project.projectSlug} ·{" "}
                            {t("admin.health3d.filesSummary", {
                              files: project.fileCount,
                              size: formatBytes(project.totalBytes),
                            })}
                            {project.unavailableCount > 0 &&
                              ` · ${t("admin.health3d.filesUnavailable", { count: project.unavailableCount })}`}
                          </p>
                        </span>
                      </button>
                      {project.fileCount > 0 && (
                        <button
                          onClick={() =>
                            download(
                              `/api/admin/3d-assets/bundle?projectId=${encodeURIComponent(project.projectId)}`,
                              bundleKey,
                              `${project.projectSlug}-3d-models.zip`
                            )
                          }
                          disabled={busy !== null}
                          className="flex shrink-0 items-center gap-1.5 rounded-control border border-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
                        >
                          <Archive className="h-3 w-3" />
                          {busy === bundleKey ? t("admin.health3d.filesBusy") : t("admin.health3d.filesDownloadAll")}
                        </button>
                      )}
                    </div>

                    {open && (
                      <div className="border-t border-neutral-100 px-2 py-2">
                        {project.groups.map((group) => (
                          <AssetGroupRows
                            key={group.groupId}
                            group={group}
                            projectSlug={project.projectSlug}
                            busy={busy}
                            failed={failed}
                            onDownload={download}
                          />
                        ))}
                        {project.fileCount > 0 && (
                          <button
                            onClick={() =>
                              download(
                                `/api/admin/3d-assets/bundle?projectId=${encodeURIComponent(project.projectId)}&scope=all`,
                                allKey,
                                `${project.projectSlug}-3d-models-all-versions.zip`
                              )
                            }
                            disabled={busy !== null}
                            className="mt-1 text-[11px] font-semibold text-brand-600 hover:underline disabled:opacity-40"
                          >
                            {busy === allKey
                              ? t("admin.health3d.filesBusy")
                              : t("admin.health3d.filesDownloadAllVersions")}
                          </button>
                        )}
                        {(failed === bundleKey || failed === allKey) && (
                          <p className="mt-1 text-[11px] text-danger">{t("admin.health3d.filesFailed")}</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </DashboardCard>
  );
}

/**
 * One detail-model slot (or the map-model group) with its versions. Only
 * the current file shows by default — history is a click away, since a
 * long-lived project accumulates versions an admin rarely wants.
 */
function AssetGroupRows({
  group,
  projectSlug,
  busy,
  failed,
  onDownload,
}: {
  group: AdminAssetGroup;
  projectSlug: string;
  busy: string | null;
  failed: string | null;
  onDownload: (url: string, key: string, fallbackName: string) => void;
}) {
  const { t } = useT();
  const [showAll, setShowAll] = useState(false);

  const current = pickCurrentFile(group.files);
  const older = group.files.filter((f) => f.versionId !== current?.versionId);
  const shown = showAll ? group.files : current ? [current] : [];

  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-center gap-1.5">
        {group.groupRole === "map" ? (
          <MapIcon className="h-3 w-3 shrink-0 text-neutral-400" />
        ) : (
          <Boxes className="h-3 w-3 shrink-0 text-neutral-400" />
        )}
        <p className="truncate text-[11px] font-semibold text-neutral-600">
          {group.groupRole === "map" ? t("admin.health3d.filesMapGroup") : group.groupName}
        </p>
      </div>
      <ul className="space-y-0.5">
        {shown.map((file) => (
          <AssetFileRow
            key={file.versionId}
            file={file}
            projectSlug={projectSlug}
            groupName={group.groupRole === "map" ? "map-model" : group.groupName}
            busy={busy}
            failed={failed}
            onDownload={onDownload}
          />
        ))}
      </ul>
      {older.length > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 text-[11px] text-neutral-400 hover:text-neutral-600"
        >
          {showAll
            ? t("admin.health3d.filesHideVersions")
            : t("admin.health3d.filesShowVersions", { count: older.length })}
        </button>
      )}
    </div>
  );
}

function AssetFileRow({
  file,
  projectSlug,
  groupName,
  busy,
  failed,
  onDownload,
}: {
  file: AdminAssetFile;
  projectSlug: string;
  groupName: string;
  busy: string | null;
  failed: string | null;
  onDownload: (url: string, key: string, fallbackName: string) => void;
}) {
  const { t, locale } = useT();
  const key = `file:${file.versionId}`;
  const sourceKey = `source:${file.versionId}`;
  const base = `/api/admin/3d-assets/download?kind=${file.kind}&versionId=${encodeURIComponent(file.versionId)}`;
  const fallbackName = `${projectSlug}__${groupName}__v${file.version}.glb`;

  return (
    <li className="flex items-center gap-2 rounded-control px-1.5 py-1 hover:bg-neutral-50">
      <span className="shrink-0 rounded-pill bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
        v{file.version}
      </span>
      <span
        className={cn(
          "shrink-0 text-[10px] font-semibold",
          file.publicationStatus === "published"
            ? "text-success"
            : file.publicationStatus === "draft"
              ? "text-warning"
              : "text-neutral-400"
        )}
      >
        {t(`admin.health3d.filesStatus${capitalize(file.publicationStatus)}`)}
      </span>
      <span className="min-w-0 flex-1">
        {/* No file name means the right-hand control already explains why
            (placement-only, or a refused URL) — repeating that sentence
            here just prints it twice on the same row. */}
        <p className="truncate text-[11px] text-neutral-700">{file.fileName ?? "—"}</p>
        <p className="truncate text-[10px] text-neutral-400">
          {file.fileSize ? `${formatBytes(file.fileSize)} · ` : ""}
          {formatRelativeDate(file.createdAt, locale)}
        </p>
      </span>

      {file.downloadable ? (
        <span className="flex shrink-0 items-center gap-1">
          {file.hasDistinctSource && (
            <button
              onClick={() => onDownload(`${base}&variant=source`, sourceKey, fallbackName)}
              disabled={busy !== null}
              title={t("admin.health3d.filesDownloadOriginal")}
              className="rounded-control border border-neutral-200 px-1.5 py-1 text-[10px] font-semibold text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
            >
              {busy === sourceKey ? t("admin.health3d.filesBusy") : t("admin.health3d.filesDownloadOriginal")}
            </button>
          )}
          <button
            onClick={() => onDownload(base, key, fallbackName)}
            disabled={busy !== null}
            aria-label={t("admin.health3d.filesDownload")}
            title={t("admin.health3d.filesDownload")}
            className="flex items-center gap-1 rounded-control border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            {busy === key ? t("admin.health3d.filesBusy") : t("admin.health3d.filesDownload")}
          </button>
        </span>
      ) : (
        <span
          className="flex shrink-0 items-center gap-1 text-[10px] text-neutral-400"
          title={file.fileName ? t("admin.health3d.filesBlockedUrl") : t("admin.health3d.filesNoFile")}
        >
          <FileWarning className="h-3 w-3" />
          {file.fileName ? t("admin.health3d.filesBlockedUrl") : t("admin.health3d.filesNoFile")}
        </span>
      )}

      {(failed === key || failed === sourceKey) && (
        <span className="shrink-0 text-[10px] text-danger">{t("admin.health3d.filesFailed")}</span>
      )}
    </li>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
