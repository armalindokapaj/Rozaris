"use client";

import { useState } from "react";
import { SearchCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

interface IntegrityReport {
  duplicateUnitCodes: { projectId: string; code: string; count: number }[];
  brokenUnitMeshLinks: { legacy: unknown[]; v2: unknown[] };
  orphanedRows: Record<string, unknown[]>;
  missingDeveloperRelationships: {
    listingsMissingPublisher: { id: string; title: string }[];
    projectsMissingPublisher: { id: string; name: string }[];
  };
}

function Section({ title, count, children }: { title: string; count: number; children?: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-neutral-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${count > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

export function DataIntegrityPanel() {
  const { t } = useT();
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function runScan() {
    setLoading(true);
    const res = await fetch("/api/admin/integrity-check");
    if (res.ok) setReport(await res.json());
    setLoading(false);
  }

  const orphanCount = report
    ? Object.values(report.orphanedRows).reduce((sum, rows) => sum + rows.length, 0)
    : 0;
  const brokenLinkCount = report ? report.brokenUnitMeshLinks.legacy.length + report.brokenUnitMeshLinks.v2.length : 0;
  const missingRelCount = report
    ? report.missingDeveloperRelationships.listingsMissingPublisher.length +
      report.missingDeveloperRelationships.projectsMissingPublisher.length
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-neutral-900">{t("admin.superAdmin.dataIntegrityTitle")}</h2>
        <p className="text-sm text-neutral-500">{t("admin.superAdmin.dataIntegritySubtitle")}</p>
      </div>

      <button
        onClick={runScan}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        <SearchCheck className="h-4 w-4" /> {loading ? t("admin.superAdmin.scanning") : t("admin.superAdmin.runScan")}
      </button>

      {report && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Section title={t("admin.superAdmin.duplicateUnits")} count={report.duplicateUnitCodes.length}>
            {report.duplicateUnitCodes.slice(0, 5).map((d, i) => (
              <p key={i} className="text-xs text-neutral-500">
                {d.projectId} · {d.code} × {d.count}
              </p>
            ))}
          </Section>
          <Section title={t("admin.superAdmin.brokenBindings")} count={brokenLinkCount} />
          <Section title={t("admin.superAdmin.orphanedMedia")} count={orphanCount} />
          <Section title={t("admin.superAdmin.missingRelationships")} count={missingRelCount} />
        </div>
      )}
    </div>
  );
}
