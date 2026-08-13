"use client";

import { useEffect, useState } from "react";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";

interface BinItem {
  id: string;
  label: string;
  deletedAt: string;
  deletedBy: string | null;
}
interface BinGroup {
  type: string;
  items: BinItem[];
}

/** Recycle Bin — lists soft-deleted rows across all 8 configured entity
 * types (`GET /api/admin/recycle-bin`), with Restore (any admin) and Hard
 * Delete (Super Admin only, typed confirmation). `isSuperAdmin` comes from
 * `/api/admin/me` via the parent tab — the Hard Delete button only renders
 * for a real Super Admin, but the route itself re-checks server-side
 * regardless (front-end visibility is never authorization). */
export function RecycleBinPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { t, locale } = useT();
  const [groups, setGroups] = useState<BinGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<{ type: string; id: string; label: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/recycle-bin");
    if (res.ok) setGroups(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function restore(type: string, id: string) {
    const res = await fetch("/api/admin/recycle-bin/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: type, entityId: id }),
    });
    if (res.ok) load();
  }

  async function hardDelete() {
    if (!confirming) return;
    setError(null);
    const res = await fetch("/api/admin/recycle-bin/hard-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: confirming.type,
        entityId: confirming.id,
        confirm: confirmText,
        reason: `Hard-deleted via Super Admin Recycle Bin`,
      }),
    });
    if (res.ok) {
      setConfirming(null);
      setConfirmText("");
      load();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? t("admin.superAdmin.hardDeleteFailed"));
    }
  }

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-neutral-900">{t("admin.superAdmin.recycleBinTitle")}</h2>
        <p className="text-sm text-neutral-500">{t("admin.superAdmin.recycleBinSubtitle")}</p>
      </div>

      {!loading && totalItems === 0 ? (
        <p className="rounded-panel border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
          {t("admin.superAdmin.recycleBinEmpty")}
        </p>
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((group) => (
            <div key={group.type} className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
              <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {group.type} ({group.items.length})
              </div>
              <ul className="divide-y divide-neutral-100">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-800">{item.label}</p>
                      <p className="text-xs text-neutral-400">
                        {t("admin.superAdmin.deletedBy", {
                          actor: item.deletedBy ?? "—",
                          date: formatRelativeDate(item.deletedAt, locale),
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => restore(group.type, item.id)}
                      className="flex items-center gap-1 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t("admin.superAdmin.restore")}
                    </button>
                    {isSuperAdmin && (
                      <button
                        onClick={() => {
                          setConfirming({ type: group.type, id: item.id, label: item.label });
                          setConfirmText("");
                          setError(null);
                        }}
                        className="flex items-center gap-1 rounded-control border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("admin.superAdmin.hardDelete")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-panel bg-white p-5 shadow-xl">
            <div className="mb-2 flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-serif text-base">{t("admin.superAdmin.hardDeleteConfirmTitle")}</h3>
            </div>
            <p className="mb-3 text-sm text-neutral-600">
              {t("admin.superAdmin.hardDeleteConfirmBody", { label: confirming.label })}
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t("admin.superAdmin.hardDeleteConfirmPlaceholder")}
              className="mb-2 w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
            />
            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirming(null)}
                className="rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600"
              >
                {t("admin.superAdmin.cancel")}
              </button>
              <button
                onClick={hardDelete}
                disabled={!confirmText}
                className="rounded-control bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {t("admin.superAdmin.hardDeleteConfirmAction")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
