"use client";

import { useRouter } from "next/navigation";
import { Boxes, Map as MapIcon } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { Badge, Btn, EmptyState, Panel, SectionHeader } from "./kit";
import type { AdminProjectRecord } from "@/hooks/useAdminProjectRecord";

/**
 * Project Manager → "3D". Deliberately a STATUS + hand-off surface, not a
 * third 3D editor: `/admin/3d-map-control/[id]` and
 * `/admin/3d-experience/[id]` are full-page GPU applications with their
 * own state, and embedding either here would be a second implementation
 * of both. What belongs in a record view is the answer to "does this
 * project have a published model yet" — which previously required opening
 * the editors one at a time to find out.
 */
export function Project3DSection({ record }: { record: AdminProjectRecord }) {
  const { t } = useT();
  const router = useRouter();
  const { threeD, project } = record;

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.threeDTitle")} description={t("projectManager.threeDDescription")} />

      <Panel
        title={t("admin.tabMapControl")}
        description={t("projectManager.mapControlDescription")}
        actions={
          <Btn onClick={() => router.push(`/admin/3d-map-control/${project.id}`)}>
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
              <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{slot.name}</p>
                  <p className="text-xs text-neutral-500">
                    {t("projectManager.slotRole", { role: slot.role })} ·{" "}
                    {t("projectManager.slotVersions", { count: slot.versionCount })}
                  </p>
                </div>
                {slot.publishedVersion !== null ? (
                  <Badge tone="positive">{t("projectManager.slotPublished", { version: slot.publishedVersion })}</Badge>
                ) : slot.latestVersion !== null ? (
                  <Badge tone="warning">{t("projectManager.slotDraftOnly", { version: slot.latestVersion })}</Badge>
                ) : (
                  <Badge tone="neutral">{t("projectManager.slotEmpty")}</Badge>
                )}
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
