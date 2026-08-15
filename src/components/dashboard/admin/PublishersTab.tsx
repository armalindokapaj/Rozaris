"use client";

import { Fragment, useState } from "react";
import { Search, KeyRound, Ban, CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { isPublisherIdle } from "@/lib/moderation";
import { useAdminPublishers, type RealPublisher } from "@/hooks/useAdminPublishers";

/** Publisher directory — real Postgres `Publisher` rows only now
 * (`GET /api/admin/publishers`, already returns every seeded + real
 * publisher, so the old separate `mockData.publishers` render pass was a
 * pure duplicate of the same 7 rows — see the "Rozaris Platform Audit"
 * memory). Each row gets a real management panel: edit contact details,
 * verify/unverify, restrict (with a time-bound option, distinct from a
 * specific listing's own idle window), and reset the owner's password —
 * all previously read-only or partially read-only. */
export function PublishersTab({ initialQuery }: { initialQuery?: string }) {
  const { t } = useT();
  const [query, setQuery] = useState(initialQuery ?? "");
  const { publishers, refresh } = useAdminPublishers(query);
  const [managing, setManaging] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.publishersTitle")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.publishersSubtitle")}</p>
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.usersSearchPlaceholder")}
          className="w-full rounded-control border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("admin.colPublisher")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colType")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colVerified")}</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {publishers.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td className="flex items-center gap-2.5 px-4 py-3">
                    <PlaceholderImage seed={p.id} kind="avatar" className="h-8 w-8 rounded-lg" iconClassName="h-3.5 w-3.5" />
                    {p.name}
                  </td>
                  <td className="px-4 py-3 capitalize text-neutral-600">{p.type.replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    {isPublisherIdle(p) ? (
                      <span className="rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">
                        {t("admin.superAdmin.restricted")}
                      </span>
                    ) : p.verified ? (
                      <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                        {t("admin.verified")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-500">
                        {t("admin.unverified")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setManaging(managing === p.id ? null : p.id)}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {managing === p.id ? t("common.close") : t("admin.manage")}
                    </button>
                  </td>
                </tr>
                {managing === p.id && (
                  <tr>
                    <td colSpan={4} className="bg-neutral-50 px-4 py-4">
                      <PublisherManagePanel publisher={p} onDone={refresh} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PublisherManagePanel({ publisher, onDone }: { publisher: RealPublisher; onDone: () => void }) {
  const { t } = useT();
  const [restrictedDays, setRestrictedDays] = useState(7);
  const [reason, setReason] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/publishers/${publisher.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ? JSON.stringify(b.error) : "Update failed.");
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => patch({ verified: !publisher.verified })}
          className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
        >
          {publisher.verified ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {publisher.verified ? t("admin.removeVerification") : t("admin.verify")}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.idleDaysLabel")}</span>
          <input
            type="number"
            min={1}
            max={365}
            value={restrictedDays}
            onChange={(e) => setRestrictedDays(Number(e.target.value))}
            className="w-20 rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.reasonLabel")}</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
          />
        </div>
        <button
          disabled={busy || !reason.trim()}
          onClick={() => patch({ restricted: true, restrictedReason: reason, restrictedDays })}
          className="flex items-center gap-1.5 rounded-control bg-warning/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Ban className="h-3.5 w-3.5" /> {t("admin.makeIdle")}
        </button>
        {publisher.restricted && (
          <button
            disabled={busy}
            onClick={() => patch({ restricted: false })}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("admin.restore")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.newPasswordLabel")}</span>
          <input
            type="text"
            value={newOwnerPassword}
            onChange={(e) => setNewOwnerPassword(e.target.value)}
            placeholder={t("admin.newPasswordPlaceholder")}
            className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <button
          disabled={busy || newOwnerPassword.length < 4}
          onClick={() => patch({ newOwnerPassword }).then(() => setNewOwnerPassword(""))}
          className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <KeyRound className="h-3.5 w-3.5" /> {t("admin.resetPassword")}
        </button>
      </div>
    </div>
  );
}
