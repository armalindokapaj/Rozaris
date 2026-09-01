"use client";

import { useRouter } from "next/navigation";
import { Archive, Boxes, Map as MapIcon } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatBytes } from "@/lib/utils";
import { useSection } from "../dashboardKit";
import { Badge, Btn, EmptyState, ErrorNote, Panel, SectionHeader } from "./kit";
import { AssetGroupBlock, useAssetDownloads } from "./Project3DAssetRows";
import type { AdminAssetProject } from "@/lib/admin3dAssets";
import type { AdminProjectRecord } from "@/hooks/useAdminProjectRecord";
import type { ProjectSectionId } from "./sections";

export function Project3DSection({
  record,
  onNavigate,
}: {
  record: AdminProjectRecord;
  onNavigate: (section: ProjectSectionId) => void;
}) {
  const { t } = useT();
  const router = useRouter();
  const { threeD, project } = record;

  const inventory = useSection<{ projects: AdminAssetProject[] }>(
    `/api/admin/3d-assets?projectId=${encodeURIComponent(project.id)}`
  );
  const assets = inventory.data?.projects[0];
  const downloads = useAssetDownloads();

  const groupFor = (groupId: string) => assets?.groups.find((g) => g.groupId === groupId);
  const bundleKey = "bundle:current";
  const bundleAllKey = "bundle:all";
  const bundleUrl = `/api/admin/3d-assets/bundle?projectId=${encodeURIComponent(project.id)}`;

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t("projectManager.threeDTitle")}
        description={t("projectManager.threeDDescription")}
        actions={
          assets && assets.fileCount > 0 ? (
            <>
              <span className="mr-1 text-[11px] text-neutral-400">
                {t("projectManager.assetSummary", {
                  files: assets.fileCount,
                  size: formatBytes(assets.totalBytes),
                })}
              </span>
              <Btn
                onClick={() =>
                  downloads.download(bundleUrl, bundleKey, `${assets.projectSlug}-3d-models.zip`)
                }
                disabled={downloads.busy !== null}
              >
                <Archive className="h-3.5 w-3.5" />
                {downloads.busy === bundleKey
                  ? t("projectManager.assetDownloadBusy")
                  : t("projectManager.assetDownloadBundle")}
              </Btn>
              <Btn
                variant="ghost"
                onClick={() =>
                  downloads.download(
                    `${bundleUrl}&scope=all`,
                    bundleAllKey,
                    `${assets.projectSlug}-3d-models-all-versions.zip`
                  )
                }
                disabled={downloads.busy !== null}
              >
                {downloads.busy === bundleAllKey
                  ? t("projectManager.assetDownloadBusy")
                  : t("projectManager.assetDownloadEveryVersion")}
              </Btn>
            </>
          ) : undefined
        }
      />

      {inventory.error && (
        <ErrorNote>
          {t("projectManager.assetsError")}{" "}
          <button type="button" onClick={inventory.reload} className="underline">
            {t("projectManager.assetsRetry")}
          </button>
        </ErrorNote>
      )}
      {(downloads.failed === bundleKey || downloads.failed === bundleAllKey) && (
        <ErrorNote>{t("projectManager.assetDownloadFailed")}</ErrorNote>
      )}

      <Panel
        title={t("admin.tabMapControl")}
        description={t("projectManager.mapControlDescription")}
        actions={
          <Btn onClick={() => onNavigate("mapControl")}>
            <MapIcon className="h-3.5 w-3.5" />
            {t("admin.openMapControlShortcut")}
          </Btn>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {threeD.hasMapModel ? (
            <>
              <Badge tone="positive">{t("projectManager.mapModelUploaded")}</Badge>
              <Badge tone={threeD.mapModelEnabled ? "positive" : "neutral"}>
                {threeD.mapModelEnabled ? t("projectManager.enabledOnMap") : t("projectManager.disabledOnMap")}
              </Badge>
            </>
          ) : (
            <Badge tone="neutral">{t("projectManager.noMapModel")}</Badge>
          )}
        </div>
        {                                                                  
                                                   }
        {(inventory.loading || groupFor("map")) && (
          <AssetGroupBlock
            group={groupFor("map")}
            projectSlug={project.slug}
            fallbackGroupName="map-model"
            loading={inventory.loading}
            error={inventory.error}
            downloads={downloads}
          />
        )}
      </Panel>

      <Panel
        title={t("admin.tab3DExperience")}
        description={t("projectManager.experienceDescription")}
        actions={
          <Btn onClick={() => router.push(`/admin/3d-experience/${project.id}`)}>
            <Boxes className="h-3.5 w-3.5" />
            {t("admin.open3DExperienceShortcut")}
          </Btn>
        }
      >
        {threeD.slots.length === 0 ? (
          <EmptyState>{t("projectManager.noModelSlots")}</EmptyState>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {threeD.slots.map((slot) => (
              <li key={slot.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">{slot.name}</p>
                    <p className="text-xs text-neutral-500">
                      {t("projectManager.slotRole", { role: slot.role })} ·{" "}
                      {t("projectManager.slotVersions", { count: slot.versionCount })}
                    </p>
                  </div>
                  {slot.publishedVersion !== null ? (
                    <Badge tone="positive">
                      {t("projectManager.slotPublished", { version: slot.publishedVersion })}
                    </Badge>
                  ) : slot.latestVersion !== null ? (
                    <Badge tone="warning">
                      {t("projectManager.slotDraftOnly", { version: slot.latestVersion })}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">{t("projectManager.slotEmpty")}</Badge>
                  )}
                </div>
                <AssetGroupBlock
                  group={groupFor(`slot:${slot.id}`)}
                  projectSlug={project.slug}
                  fallbackGroupName={slot.name}
                  loading={inventory.loading}
                  error={inventory.error}
                  downloads={downloads}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          {threeD.hasConfig ? t("projectManager.hasSceneConfig") : t("projectManager.noSceneConfig")}
        </p>
      </Panel>
    </div>
  );
}
