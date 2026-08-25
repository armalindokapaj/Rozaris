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

/**
 * Project Manager → "3D". Deliberately a STATUS + hand-off surface, not a
 * third 3D editor: `/admin/3d-experience/[id]` is a full-page GPU
 * application with its own state, and embedding it here would be a second
 * implementation of it. What belongs in a record view is the answer to
 * "does this project have a published model yet" — which previously
 * required opening the editors one at a time to find out.
 *
 * It is also where the project's model FILES are retrieved: each slot's
 * current GLB, its version history, and the whole project as one `.zip`.
 * That is not a hole in the no-editor rule — retrieving an artefact a
 * record already points at is the same class of thing as reporting its
 * status, and it is the record view (not a GPU canvas) that an admin is
 * looking at when they need the file. It is deliberately read-only:
 * nothing here uploads, publishes, rolls back or deletes a version, all of
 * which stay in the editors that own that state. The transfers reuse the
 * existing admin-gated `/api/admin/3d-assets*` routes wholesale, so this
 * section adds a second consumer, not a second implementation.
 *
 * The Map Control is the exception, and hands off to this record's own
 * "3D Map Control" section rather than out to `/admin/3d-map-control/[id]`:
 * it carries the project's canonical location pin
 * (src/lib/projectLocation.ts), which is a record field, so it has to be
 * editable alongside the rest of the record and under the same save.
 */
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

  // The record route answers "which slots exist and what is published";
  // the asset inventory answers "which of those versions has a file we can
  // actually hand over". They are separate reads on purpose — this one is
  // rate-limited and audit-adjacent, and the panels below still render
  // their badge content while it is in flight.
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
          // Only offered once something is actually retrievable — a zip
          // button that can only ever produce an empty archive is worse
          // than no button.
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
          // Stays inside the record — the Map Control is a section of this
          // page now, not only a separate route, and it carries the
          // project's canonical location pin (src/lib/projectLocation.ts).
          // That section's own header still offers the full-page route for
          // the cases that want the whole screen.
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
        {/* Gated on the asset inventory, NOT on `threeD.hasMapModel`: that
            flag answers "is a model on the map right now" (it excludes
            archived versions), which is the wrong question for a retrieval
            surface. "Remove model" archives the published version but keeps
            the row and its Blob object — precisely the moment an admin comes
            here for the file. The header count and both zip buttons already
            read the inventory, so gating on it too keeps the three from
            disagreeing. The badges above still report map STATUS truthfully,
            and each row labels itself archived. */}
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
