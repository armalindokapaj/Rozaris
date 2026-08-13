"use client";

import { useEffect, useState } from "react";
import { AlertOctagon, Clock, ServerCrash } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

interface Health {
  brokenGlbs: {
    blockedMapModels: { id: string; projectId: string; version: number; fileName: string }[];
    blockedDetailModels: { id: string; projectId: string; version: number; fileName: string }[];
    warningMapModelCount: number;
    warningDetailModelCount: number;
  };
  stuckDrafts: { mapModelCount: number; detailModelCount: number; thresholdDays: number };
  apiErrors: { last24h: number; recent: { id: string; route: string; message: string; createdAt: string }[]; forwardOnlyNotice: string };
}

/** System Health — real DB-observable signals only (see the route's doc
 * comment for the two honest limits: forward-only error log, no infra/APM). */
export function SystemHealthPanel() {
  const { t } = useT();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/admin/system-health")
      .then((r) => (r.ok ? r.json() : null))
      .then(setHealth);
  }, []);

  if (!health) return <p className="text-sm text-neutral-400">{t("admin.superAdmin.loading")}</p>;

  const brokenCount = health.brokenGlbs.blockedMapModels.length + health.brokenGlbs.blockedDetailModels.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-neutral-900">{t("admin.superAdmin.systemHealthTitle")}</h2>
        <p className="text-sm text-neutral-500">{t("admin.superAdmin.systemHealthSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-panel border border-neutral-200 bg-white p-4">
          <div className="mb-1 flex items-center gap-2 text-red-600">
            <AlertOctagon className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">{t("admin.superAdmin.brokenGlbs")}</span>
          </div>
          <p className="text-2xl font-serif text-neutral-900">{brokenCount}</p>
          <p className="text-xs text-neutral-400">
            {t("admin.superAdmin.warningGlbs", {
              count: health.brokenGlbs.warningMapModelCount + health.brokenGlbs.warningDetailModelCount,
            })}
          </p>
        </div>
        <div className="rounded-panel border border-neutral-200 bg-white p-4">
          <div className="mb-1 flex items-center gap-2 text-amber-600">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">{t("admin.superAdmin.stuckDrafts")}</span>
          </div>
          <p className="text-2xl font-serif text-neutral-900">
            {health.stuckDrafts.mapModelCount + health.stuckDrafts.detailModelCount}
          </p>
          <p className="text-xs text-neutral-400">
            {t("admin.superAdmin.stuckDraftsNote", { days: health.stuckDrafts.thresholdDays })}
          </p>
        </div>
        <div className="rounded-panel border border-neutral-200 bg-white p-4">
          <div className="mb-1 flex items-center gap-2 text-neutral-600">
            <ServerCrash className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">{t("admin.superAdmin.apiErrors24h")}</span>
          </div>
          <p className="text-2xl font-serif text-neutral-900">{health.apiErrors.last24h}</p>
          <p className="text-xs text-neutral-400">{health.apiErrors.forwardOnlyNotice}</p>
        </div>
      </div>

      {brokenCount > 0 && (
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("admin.superAdmin.brokenGlbs")}
          </div>
          <ul className="divide-y divide-neutral-100">
            {[...health.brokenGlbs.blockedMapModels, ...health.brokenGlbs.blockedDetailModels].map((m) => (
              <li key={m.id} className="px-4 py-2 text-sm text-neutral-700">
                {m.projectId} · v{m.version} · {m.fileName}
              </li>
            ))}
          </ul>
        </div>
      )}

      {health.apiErrors.recent.length > 0 && (
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("admin.superAdmin.recentErrors")}
          </div>
          <ul className="divide-y divide-neutral-100">
            {health.apiErrors.recent.map((e) => (
              <li key={e.id} className="px-4 py-2 text-xs">
                <span className="font-mono text-neutral-500">{e.route}</span> — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
