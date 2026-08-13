"use client";

import { useEffect, useState } from "react";
import { ScrollText, ChevronDown, ChevronUp } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import { BeforeAfterDiff } from "./BeforeAfterDiff";

interface AuditRow {
  id: string;
  actor: string;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  reason?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  hardDeleted: boolean;
  createdAt: string;
}

/**
 * Global Audit Log — real, replaces `AuditLogTab.tsx`'s old session-local
 * Zustand mock body with a paginated `GET /api/admin/audit-log` feed.
 * Every row is expandable to its Before/After diff when the entry carries
 * one (only writes made after this pass do — older rows just show the
 * action/actor/entity line, honestly, no fabricated diff).
 */
export function AuditLogPanel() {
  const { t, locale } = useT();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entityType, setEntityType] = useState("");
  const [actor, setActor] = useState("");

  async function load(reset: boolean) {
    setLoading(true);
    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    if (actor) params.set("actor", actor);
    if (!reset && cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setRows((prev) => (reset ? data.items : [...prev, ...data.items]));
      setCursor(data.nextCursor);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, actor]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-neutral-900">{t("admin.auditLogTitle")}</h2>
        <p className="text-sm text-neutral-500">{t("admin.superAdmin.auditLogSubtitleReal")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder={t("admin.superAdmin.filterEntityType")}
          className="rounded-control border border-neutral-200 bg-white px-3 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
        />
        <input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder={t("admin.superAdmin.filterActor")}
          className="rounded-control border border-neutral-200 bg-white px-3 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
        />
      </div>

      {rows.length === 0 && !loading ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("admin.auditLogEmpty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <ul className="divide-y divide-neutral-100">
            {rows.map((entry) => {
              const isOpen = expanded === entry.id;
              const hasDiff = Boolean(entry.previousState || entry.newState);
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div
                    className={`flex items-start gap-3 ${hasDiff ? "cursor-pointer" : ""}`}
                    onClick={() => hasDiff && setExpanded(isOpen ? null : entry.id)}
                  >
                    <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-neutral-800">
                        <span className="font-semibold">{entry.actor}</span> — {entry.action}
                        {entry.hardDeleted && (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                            {t("admin.superAdmin.hardDeleted")}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {entry.entityType} · {entry.entityLabel ?? entry.entityId}
                        {entry.reason ? ` — ${entry.reason}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-neutral-400">
                      {formatRelativeDate(entry.createdAt, locale)}
                    </span>
                    {hasDiff && (isOpen ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />)}
                  </div>
                  {isOpen && hasDiff && (
                    <div className="mt-3 pl-7">
                      <BeforeAfterDiff before={entry.previousState} after={entry.newState} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {cursor && (
        <button
          onClick={() => load(false)}
          disabled={loading}
          className="rounded-control border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
        >
          {loading ? t("admin.superAdmin.loading") : t("admin.superAdmin.loadMore")}
        </button>
      )}
    </div>
  );
}
