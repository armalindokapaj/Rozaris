"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { Btn, EmptyState, Panel, SectionHeader } from "./kit";

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  reason: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export function ProjectActivitySection({ projectId }: { projectId: string }) {
  const { t } = useT();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/audit-log?projectId=${encodeURIComponent(projectId)}&limit=40`)
      .then((r) => (r.ok ? r.json() : { items: [], nextCursor: null }))
      .then((body: { items: AuditRow[]; nextCursor: string | null }) => {
        if (cancelled) return;
        setRows(body.items);
        setCursor(body.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function loadMore(afterCursor: string) {
    const params = new URLSearchParams({ projectId, limit: "40", cursor: afterCursor });
    const res = await fetch(`/api/admin/audit-log?${params}`);
    if (!res.ok) return;
    const body = (await res.json()) as { items: AuditRow[]; nextCursor: string | null };
    setRows((prev) => [...(prev ?? []), ...body.items]);
    setCursor(body.nextCursor);
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t("projectManager.activityTitle")} description={t("projectManager.activityDescription")} />

      <Panel>
        {rows === null ? (
          <p className="py-6 text-center text-xs text-neutral-400">{t("admin.loading")}</p>
        ) : rows.length === 0 ? (
          <EmptyState>{t("projectManager.noActivity")}</EmptyState>
        ) : (
          <>
            <ol className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900">{row.action}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {row.entityLabel ? `${row.entityLabel} · ` : ""}
                      {row.actor}
                      {row.reason ? ` · ${row.reason}` : ""}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs tabular-nums text-neutral-400">
                    {new Date(row.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
            {cursor && (
              <Btn
                className="mt-3"
                disabled={loadingMore}
                onClick={async () => {
                  setLoadingMore(true);
                  await loadMore(cursor);
                  setLoadingMore(false);
                }}
              >
                {loadingMore ? t("admin.loading") : t("projectManager.loadMore")}
              </Btn>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
