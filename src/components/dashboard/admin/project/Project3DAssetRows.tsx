"use client";

import { useState } from "react";
import { Download, FileWarning } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn, formatBytes, formatRelativeDate } from "@/lib/utils";
import { downloadAdminAsset, pickCurrentFile } from "@/lib/admin3dAssetView";
import type { AdminAssetFile, AdminAssetGroup } from "@/lib/admin3dAssets";
import { Btn } from "./kit";

/**
 * The file-level half of the Project Manager's 3D Assets section, split out
 * so `Project3DSection` stays what it has always been — a short panel that
 * answers "what does this project have" — instead of growing a second
 * screenful of version-row markup inside itself.
 *
 * Everything here is a view over `/api/admin/3d-assets?projectId=…`. It
 * never sees a Blob URL: a download is `(kind, versionId)` handed to the
 * admin-gated proxy, which is what keeps the store URLs off the wire and
 * every transfer in the audit log.
 */

export interface AssetDownloads {
  /** Key of the transfer currently in flight, or null. One at a time: a
   *  GLB is tens of megabytes and parallel clicks mostly produce a queue
   *  the admin cannot see. */
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

/**
 * One slot's (or the map model's) files: the current version inline, the
 * rest behind a disclosure. A long-lived project accumulates versions an
 * admin almost never wants, and showing all of them by default would bury
 * the one file that is actually live.
 *
 * `group` is undefined when the record knows about a slot that holds no
 * version row at all — a real state for a freshly created slot, and worth
 * saying out loud rather than rendering an empty gap.
 *
 * `error` therefore has to be checked BEFORE that empty case: the record
 * and the inventory are two independent reads, so when the inventory one
 * fails the slot keeps rendering its (still correct) "Published vN" badge
 * while every group goes undefined. An undefined `group` is ambiguous
 * between "no version rows" and "we could not read the inventory", and
 * only in the first case may we assert there is no file — saying "no model
 * file uploaded" under a published slot because a fetch 500'd is an
 * affirmatively false statement about the project's data. In the failure
 * case the section-level `ErrorNote` (with its Retry) is the one place
 * that explains it; repeating it per row would print the same sentence
 * once per slot.
 */
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
  // Only used if a proxy strips the server's Content-Disposition; the
  // route's own `buildDownloadName()` normally wins.
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
        {/* A missing file name means the right-hand side already explains
            why the row has nothing to download; repeating it here would
            print the same sentence twice on one line. */}
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
        // Say why instead of showing a button that cannot work. The two
        // reasons are genuinely different: one is a legitimate
        // placement-only version, the other is a row whose URL the SSRF
        // gate refuses to fetch and which someone should look at.
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
