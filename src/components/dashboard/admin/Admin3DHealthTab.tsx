"use client";

import { useRouter } from "next/navigation";
import { AlertOctagon, Boxes, Map as MapIcon, Clock } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn, formatRelativeDate } from "@/lib/utils";
import { useSection, DashboardCard } from "./dashboardKit";
import { Admin3DFilesPanel } from "./Admin3DFilesPanel";

interface ThreeDHealthSummary {
  mapGlbsLive: number;
  detailGlbsLive: number;
  experiencesDraft: number;
  experiencesPublished: number;
  failedUploads: number;
  performanceWarnings: number;
  stuckDrafts: number;
  missingBindings: { projectCount: number; projects: { projectId: string; projectName: string; totalUnits: number; linkedUnits: number }[] };
}

interface BlockedVersion {
  id: string;
  projectId: string;
  version: number;
  fileName: string;
  createdAt: string;
  project: { name: string } | null;
}
interface SystemHealthPayload {
  brokenGlbs: {
    blockedMapModels: BlockedVersion[];
    blockedDetailModels: BlockedVersion[];
    warningMapModelCount: number;
    warningDetailModelCount: number;
  };
  stuckDrafts: { mapModelCount: number; detailModelCount: number; thresholdDays: number };
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" }) {
  return (
    <div className="rounded-panel border border-neutral-200 bg-white p-4">
      <p
        className={cn(
          "font-serif text-2xl leading-none",
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warning" : "text-neutral-900"
        )}
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  );
}

export function Admin3DHealthTab() {
  const { t, locale } = useT();
  const router = useRouter();
  const summary = useSection<ThreeDHealthSummary>("/api/admin/dashboard/3d-health");
  const health = useSection<SystemHealthPayload>("/api/admin/system-health");

  const blocked = health.data
    ? [
        ...health.data.brokenGlbs.blockedMapModels.map((v) => ({ ...v, kind: "map" as const })),
        ...health.data.brokenGlbs.blockedDetailModels.map((v) => ({ ...v, kind: "detail" as const })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.tab3DHealth")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.health3d.subtitle")}</p>
      </div>

      <DashboardCard title={t("admin.dashboard.threeDHealthTitle")} loading={summary.loading} error={summary.error} onRetry={summary.reload}>
        {summary.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={t("admin.dashboard.threeDHealthMapLive")} value={summary.data.mapGlbsLive} />
            <Stat label={t("admin.dashboard.threeDHealthDetailLive")} value={summary.data.detailGlbsLive} />
            <Stat label={t("admin.dashboard.threeDHealthDraft")} value={summary.data.experiencesDraft} />
            <Stat label={t("admin.dashboard.threeDHealthPublished")} value={summary.data.experiencesPublished} />
            <Stat
              label={t("admin.dashboard.threeDHealthFailedUploads")}
              value={summary.data.failedUploads}
              tone={summary.data.failedUploads > 0 ? "danger" : undefined}
            />
            <Stat
              label={t("admin.dashboard.threeDHealthMissingBindings")}
              value={summary.data.missingBindings.projectCount}
              tone={summary.data.missingBindings.projectCount > 0 ? "warn" : undefined}
            />
          </div>
        )}
      </DashboardCard>

      <Admin3DFilesPanel />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardCard title={t("admin.health3d.blockedTitle")} loading={health.loading} error={health.error} onRetry={health.reload}>
          {blocked.length === 0 ? (
            <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
              {t("admin.health3d.blockedEmpty")}
            </p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto scroll-thin pr-1">
              {blocked.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => router.push(v.kind === "map" ? `/admin/3d-map-control/${v.projectId}` : `/admin/3d-experience/${v.projectId}`)}
                    className="flex w-full items-center gap-2.5 rounded-control px-2 py-2 text-left hover:bg-neutral-50"
                  >
                    {v.kind === "map" ? (
                      <MapIcon className="h-3.5 w-3.5 shrink-0 text-danger" />
                    ) : (
                      <Boxes className="h-3.5 w-3.5 shrink-0 text-danger" />
                    )}
                    <span className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-neutral-900">
                        {v.project?.name ?? v.projectId} · v{v.version}
                      </p>
                      <p className="truncate text-[11px] text-neutral-400">
                        {v.fileName} · {formatRelativeDate(v.createdAt, locale)}
                      </p>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard
          title={t("admin.dashboard.threeDHealthMissingBindings")}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
        >
          {summary.data && (
            <>
              {summary.data.missingBindings.projects.length === 0 ? (
                <p className="rounded-control border border-dashed border-neutral-200 py-6 text-center text-xs text-neutral-400">
                  {t("admin.health3d.bindingsEmpty")}
                </p>
              ) : (
                <ul className="space-y-1">
                  {summary.data.missingBindings.projects.map((p) => (
                    <li key={p.projectId}>
                      <button
                        onClick={() => router.push(`/admin/3d-experience/${p.projectId}`)}
                        className="flex w-full items-center justify-between gap-2 rounded-control px-2 py-2 text-left hover:bg-neutral-50"
                      >
                        <span className="truncate text-xs font-semibold text-neutral-900">{p.projectName}</span>
                        <span className="shrink-0 text-[11px] text-neutral-400">
                          {p.linkedUnits}/{p.totalUnits}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {health.data && (
                <p className="mt-3 flex items-center gap-1.5 border-t border-neutral-100 pt-3 text-[11px] text-neutral-400">
                  <Clock className="h-3 w-3" />
                  {t("admin.health3d.stuckDraftsNote", {
                    count: health.data.stuckDrafts.mapModelCount + health.data.stuckDrafts.detailModelCount,
                    days: health.data.stuckDrafts.thresholdDays,
                  })}
                </p>
              )}
            </>
          )}
        </DashboardCard>
      </div>

      {summary.data && summary.data.performanceWarnings > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertOctagon className="h-3.5 w-3.5" />
          {summary.data.performanceWarnings} {t("admin.dashboard.threeDHealthPerfWarnings")}
        </p>
      )}
    </div>
  );
}
