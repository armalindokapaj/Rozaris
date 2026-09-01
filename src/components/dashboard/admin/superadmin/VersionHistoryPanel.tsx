"use client";

import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import { BeforeAfterDiff } from "./BeforeAfterDiff";

const ENTITY_TYPES = [
  "project",
  "unit",
  "publisher",
  "user",
  "listing",
  "mapModelVersion",
  "detailModelVersion",
  "platformHdri",
  "project3DConfig",
];

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  reason?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  createdAt: string;
}

export function VersionHistoryPanel() {
  const { t, locale } = useT();
  const [entityType, setEntityType] = useState("project");
  const [entityId, setEntityId] = useState("");
  const [current, setCurrent] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (!entityId.trim()) return;
    setLoading(true);
    setLoaded(false);
    const res = await fetch(`/api/admin/entities/${entityType}/${encodeURIComponent(entityId.trim())}`);
    if (res.ok) {
      const data = await res.json();
      setCurrent(data.current);
      setHistory(data.history);
      setLoaded(true);
    }
    setLoading(false);
  }

  async function restoreVersion(auditLogId: string) {
    const res = await fetch(
      `/api/admin/entities/${entityType}/${encodeURIComponent(entityId.trim())}/restore-version`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditLogId }),
      }
    );
    if (res.ok) load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-neutral-900">{t("admin.superAdmin.versionHistoryTitle")}</h2>
        <p className="text-sm text-neutral-500">{t("admin.superAdmin.versionHistorySubtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="rounded-control border border-neutral-200 bg-white px-3 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
        >
          {ENTITY_TYPES.map((t2) => (
            <option key={t2} value={t2}>
              {t2}
            </option>
          ))}
        </select>
        <input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder={t("admin.superAdmin.entityIdPlaceholder")}
          className="min-w-[16rem] rounded-control border border-neutral-200 bg-white px-3 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
        />
        <button
          onClick={load}
          disabled={loading || !entityId.trim()}
          className="rounded-control bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {loading ? t("admin.superAdmin.loading") : t("admin.superAdmin.lookUp")}
        </button>
      </div>

      {loaded && !current && (
        <p className="text-sm text-neutral-400">{t("admin.superAdmin.entityNotFound")}</p>
      )}

      {loaded && history.length === 0 && (
        <p className="text-sm text-neutral-400">{t("admin.superAdmin.noHistory")}</p>
      )}

      {history.length > 0 && (
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100">
            {history.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-800">
                      <span className="font-semibold">{row.actor}</span> — {row.action}
                      {row.reason ? ` (${row.reason})` : ""}
                    </p>
                    <p className="text-xs text-neutral-400">{formatRelativeDate(row.createdAt, locale)}</p>
                    {(row.previousState || row.newState) && (
                      <div className="mt-2">
                        <BeforeAfterDiff before={row.previousState} after={row.newState} />
                      </div>
                    )}
                  </div>
                  {row.newState && (
                    <button
                      onClick={() => restoreVersion(row.id)}
                      className="flex shrink-0 items-center gap-1 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t("admin.superAdmin.restoreThisVersion")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
