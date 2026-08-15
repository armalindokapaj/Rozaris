"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useT";

interface ReportsSummary {
  pendingApprovals: number;
  avgApprovalHours: number | null;
  decisionsRecorded: number;
  duplicateFlags: number;
  apiErrors24h: number;
}

function ReportStat({ label, value, footnote }: { label: string; value: string; footnote?: string }) {
  return (
    <div className="rounded-panel border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
      {footnote && <p className="mt-0.5 text-[11px] text-neutral-400">{footnote}</p>}
    </div>
  );
}

/** Reports tab — real Postgres aggregates (`GET /api/admin/reports-summary`),
 * replacing four numbers that used to be hardcoded literals. */
export function ReportsTab() {
  const { t } = useT();
  const [data, setData] = useState<ReportsSummary | null>(null);

  useEffect(() => {
    fetch("/api/admin/reports-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl text-neutral-900">{t("admin.reportsTitle")}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ReportStat label={t("admin.reportPendingApprovals")} value={data ? String(data.pendingApprovals) : "…"} />
        <ReportStat
          label={t("admin.reportApprovalSla")}
          value={data?.avgApprovalHours != null ? `${data.avgApprovalHours.toFixed(1)}h` : t("admin.reportNoData")}
          footnote={data ? t("admin.reportBasedOnDecisions", { count: data.decisionsRecorded }) : undefined}
        />
        <ReportStat label={t("admin.reportDuplicateFlags")} value={data ? String(data.duplicateFlags) : "…"} />
        <ReportStat label={t("admin.reportApiErrors24h")} value={data ? String(data.apiErrors24h) : "…"} />
      </div>
    </div>
  );
}
