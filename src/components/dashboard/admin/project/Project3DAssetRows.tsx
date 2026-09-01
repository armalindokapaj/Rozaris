"use client";

import { useState } from "react";
import { Download, FileWarning } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn, formatBytes, formatRelativeDate } from "@/lib/utils";
import { downloadAdminAsset, pickCurrentFile } from "@/lib/admin3dAssetView";
import type { AdminAssetFile, AdminAssetGroup } from "@/lib/admin3dAssets";
import { Btn } from "./kit";

export interface AssetDownloads {
  busy: string | null;
  failed: string | null;
  download: (url: string, key: string, fallbackName: string) => void;
}

export function useAssetDownloads(): AssetDownloads {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  return {
    busy,
    failed,
    download: (url, key, fallbackName) => {
      setBusy(key);
      setFailed(null);
      void downloadAdminAsset(url, fallbackName)
        .catch(() => setFailed(key))
        .finally(() => setBusy(null));
    },
  };
}

export function AssetGroupBlock({
  group,
  projectSlug,
  fallbackGroupName,
  loading,
  error,
  downloads,
}: {
  group: AdminAssetGroup | undefined;
  projectSlug: string;
  fallbackGroupName: string;
  loading: boolean;
  error: boolean;
  downloads: AssetDownloads;
}) {
  const { t } = useT();
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return <p className="mt-2 text-xs text-neutral-400">{t("projectManager.assetsLoading")}</p>;
  }
  if (error) {
    return null;
  }
  if (!group || group.files.length === 0) {
    return <p className="mt-2 text-xs text-neutral-400">{t("projectManager.assetNoFiles")}</p>;
  }

  const current = pickCurrentFile(group.files);
  const older = group.files.filter((f) => f.versionId !== current?.versionId);
  const shown = showAll ? group.files : current ? [current] : [];
  const groupName = group.groupRole === "map" ? "map-model" : group.groupName;

  return (
    <div className="mt-2">
      <ul className="space-y-1">
        {shown.map((file) => (
          <AssetVersionRow
            key={file.versionId}
            file={file}
            projectSlug={projectSlug}
            groupName={groupName || fallbackGroupName}
            downloads={downloads}
          />
        ))}
      </ul>
      {older.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900"
        >
          {showAll
            ? t("projectManager.assetHideVersions")
            : t("projectManager.assetShowVersions", { count: older.length })}
        </button>
      )}
    </div>
  );
}

function AssetVersionRow({
  file,
  projectSlug,
  groupName,
  downloads,
}: {
  file: AdminAssetFile;
  projectSlug: string;
  groupName: string;
  downloads: AssetDownloads;
}) {
  const { t, locale } = useT();
  const { busy, failed, download } = downloads;
  const key = `file:${file.versionId}`;
  const sourceKey = `source:${file.versionId}`;
  const base = `/api/admin/3d-assets/download?kind=${file.kind}&versionId=${encodeURIComponent(file.versionId)}`;
  const fallbackName = `${projectSlug}__${groupName}__v${file.version}.glb`;

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-control bg-neutral-50 px-2.5 py-2">
      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-500">
        v{file.version}
      </span>
      <span
        className={cn(
          "shrink-0 text-[11px] font-semibold",
          file.publicationStatus === "published"
            ? "text-emerald-600"
            : file.publicationStatus === "draft"
              ? "text-amber-600"
              : "text-neutral-400"
        )}
      >
        {t(`projectManager.assetStatus${capitalize(file.publicationStatus)}`)}
      </span>
      <span className="min-w-0 flex-1">
        {                                                                 
                                                         }
        <span className="block truncate text-xs text-neutral-700">{file.fileName ?? "—"}</span>
        <span className="block truncate text-[11px] text-neutral-400">
          {file.fileSize ? `${formatBytes(file.fileSize)} · ` : ""}
          {formatRelativeDate(file.createdAt, locale)}
        </span>
      </span>

      {file.downloadable ? (
        <span className="flex shrink-0 items-center gap-1.5">
          {file.hasDistinctSource && (
            <Btn
              variant="ghost"
              onClick={() => download(`${base}&variant=source`, sourceKey, fallbackName)}
              disabled={busy !== null}
              className="px-2 py-1"
            >
              {busy === sourceKey
                ? t("projectManager.assetDownloadBusy")
                : t("projectManager.assetDownloadOriginal")}
            </Btn>
          )}
          <Btn
            onClick={() => download(base, key, fallbackName)}
            disabled={busy !== null}
            className="px-2.5 py-1"
          >
            <Download className="h-3.5 w-3.5" />
            {busy === key ? t("projectManager.assetDownloadBusy") : t("projectManager.assetDownload")}
          </Btn>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-neutral-400">
          <FileWarning className="h-3.5 w-3.5" />
          {file.fileName ? t("projectManager.assetBlockedUrl") : t("projectManager.assetNoFile")}
        </span>
      )}

      {(failed === key || failed === sourceKey) && (
        <span className="w-full text-[11px] font-medium text-danger">
          {t("projectManager.assetDownloadFailed")}
        </span>
      )}
    </li>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
