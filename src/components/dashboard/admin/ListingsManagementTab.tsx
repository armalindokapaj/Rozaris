"use client";

import { Fragment, useEffect, useState } from "react";
import { Plus, Ban, CheckCircle2, Gem, ArrowRightLeft, Copy, History } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { formatRelativeDate } from "@/lib/utils";
import { NewListingForm } from "@/components/dashboard/NewListingForm";
import { AnalyticsSummaryInline } from "@/components/common/AnalyticsSummaryInline";
import { isListingIdle, isListingStale } from "@/lib/moderation";
import type { Listing } from "@/lib/types";

interface PublisherOption {
  id: string;
  name: string;
}

/** `GET /api/admin/listings?status=all`'s shape — the public `Listing`
 * type plus the admin-only idle/staleness fields it deliberately omits. */
type AdminListingRow = Listing & {
  idleUntil: string | null;
  idleReason: string | null;
  lastRenewedAt: string;
  locationConfirmed: boolean;
  duplicateOfId: string | null;
};

const STATUS_STYLE: Record<Listing["status"], string> = {
  draft: "bg-neutral-100 text-neutral-500",
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  archived: "bg-neutral-100 text-neutral-500",
  sold: "bg-neutral-100 text-neutral-500",
  rented: "bg-neutral-100 text-neutral-500",
  expired: "bg-neutral-100 text-neutral-500",
  suspended: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
};

/**
 * Real create/edit/moderate surface for `Listing` from the admin console —
 * previously the only admin-facing listing surface was the Queue tab's
 * approve/reject actions on already-submitted rows; Admin had no way to
 * create one directly, or to see/manage a listing once it left "pending"
 * (see the "Rozaris Platform Audit" memory). Reuses `NewListingForm`
 * (publisher-picker added here) for creation rather than a second form.
 */
export function ListingsManagementTab() {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [publishers, setPublishers] = useState<PublisherOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [publisherId, setPublisherId] = useState("");
  const [managing, setManaging] = useState<string | null>(null);

  function refresh() {
    fetch("/api/admin/listings?status=all")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: AdminListingRow[]) => setListings(rows))
      .catch(() => {});
  }

  useEffect(() => {
    refresh();
    fetch("/api/admin/publishers")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PublisherOption[]) => setPublishers(rows))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{t("admin.listingsMgmtTitle")}</h1>
          <p className="text-sm text-neutral-500">{t("admin.listingsMgmtSubtitle")}</p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> {t("admin.newListing")}
        </button>
      </div>

      {creating && (
        <div className="space-y-3 rounded-panel border border-neutral-200 bg-white p-4">
          <label className="block max-w-xs">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.postingOnBehalfOf")}</span>
            <select
              value={publisherId}
              onChange={(e) => setPublisherId(e.target.value)}
              className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
            >
              <option value="">{t("dashboard.selectNeighborhood")}</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {publisherId && (
            <NewListingForm
              publisherId={publisherId}
              onSaved={() => {
                setCreating(false);
                refresh();
              }}
              onCancel={() => setCreating(false)}
            />
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.titleLabel")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colPublisher")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.priceLabel")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colStatus")}</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {listings.map((l) => (
              <Fragment key={l.id}>
                <tr>
                  <td className="px-4 py-3 font-medium text-neutral-800">{l.title}</td>
                  <td className="px-4 py-3 text-neutral-600">{l.publisher.name}</td>
                  <td className="px-4 py-3 tabular-nums text-neutral-600">{priceFmt(l.price)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLE[l.status]}`}>
                      {l.status}
                    </span>
                    {isListingIdle(l) && (
                      <span className="ml-1.5 rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">
                        {t("admin.idleBadge")}
                      </span>
                    )}
                    {isListingStale(l) && (
                      <span className="ml-1.5 rounded-full bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">
                        {t("admin.staleBadge")}
                      </span>
                    )}
                    {l.premium && (
                      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                        <Gem className="h-3 w-3" /> {t("admin.premiumBadge")}
                      </span>
                    )}
                    {l.duplicateOfId && (
                      <span className="ml-1.5 rounded-full bg-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-600">
                        {t("admin.duplicateBadge")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setManaging(managing === l.id ? null : l.id)}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {managing === l.id ? t("common.close") : t("admin.manage")}
                    </button>
                  </td>
                </tr>
                {managing === l.id && (
                  <tr>
                    <td colSpan={5} className="bg-neutral-50 px-4 py-4">
                      <ListingManagePanel listing={l} publishers={publishers} onDone={refresh} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {listings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-400">
                  {t("admin.noListingsYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListingManagePanel({
  listing,
  publishers,
  onDone,
}: {
  listing: AdminListingRow;
  publishers: PublisherOption[];
  onDone: () => void;
}) {
  const { t } = useT();
  const [idleDays, setIdleDays] = useState(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [duplicateTarget, setDuplicateTarget] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/listings/${listing.id}/publication`, {
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
    <div className="space-y-3">
      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      <AnalyticsSummaryInline entityType="listing" entityId={listing.id} />

      {listing.status === "draft" && (
        <div className="rounded-control bg-warning/10 px-3 py-2 text-xs text-neutral-700">
          {t("admin.draftNoLocationNote")}
          <button
            disabled={busy}
            onClick={() => patch({ status: "pending" })}
            className="ml-2 font-semibold text-brand-700 hover:underline"
          >
            {t("admin.approveWithoutLocation")}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(["pending", "active", "suspended", "archived", "rejected"] as const).map((s) => (
          <button
            key={s}
            disabled={busy || listing.status === s}
            onClick={() => {
              if (s === "suspended" && !reason.trim()) return;
              patch({ status: s, reason: s === "suspended" ? reason : undefined });
            }}
            className="rounded-pill border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:border-neutral-300 disabled:opacity-40"
          >
            → {s}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.idleDaysLabel")}</span>
          <input
            type="number"
            min={1}
            max={365}
            value={idleDays}
            onChange={(e) => setIdleDays(Number(e.target.value))}
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
          onClick={() => patch({ idleDays, reason })}
          className="flex items-center gap-1.5 rounded-control bg-warning/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Ban className="h-3.5 w-3.5" /> {t("admin.makeIdle")}
        </button>
        <button
          disabled={busy}
          onClick={() => patch({ idleDays: 0 })}
          className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("admin.restore")}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
        <button
          disabled={busy}
          onClick={() => patch({ premium: !listing.premium })}
          className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
            listing.premium
              ? "bg-brand-500 text-white hover:bg-brand-600"
              : "border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          <Gem className="h-3.5 w-3.5" /> {listing.premium ? t("admin.removeFeatured") : t("admin.makeFeatured")}
        </button>

        <div className="flex items-end gap-1.5">
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.transferToLabel")}</span>
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
            >
              <option value="">{t("admin.selectPublisher")}</option>
              {publishers
                .filter((p) => p.id !== listing.publisher.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          <button
            disabled={busy || !transferTo}
            onClick={() => {
              patch({ transferToPublisherId: transferTo });
              setTransferTo("");
            }}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> {t("admin.transferAction")}
          </button>
        </div>

        {listing.duplicateOfId ? (
          <button
            disabled={busy}
            onClick={() => patch({ duplicateOfId: null })}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" /> {t("admin.clearDuplicate")}
          </button>
        ) : (
          <div className="flex items-end gap-1.5">
            <div>
              <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.duplicateOfLabel")}</span>
              <input
                value={duplicateTarget}
                onChange={(e) => setDuplicateTarget(e.target.value)}
                placeholder={t("admin.duplicateOfPlaceholder")}
                className="w-40 rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <button
              disabled={busy || !duplicateTarget.trim()}
              onClick={() => {
                patch({ duplicateOfId: duplicateTarget.trim(), status: "suspended", reason: "Marked as duplicate" });
                setDuplicateTarget("");
              }}
              className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" /> {t("admin.markDuplicate")}
            </button>
          </div>
        )}

        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <History className="h-3.5 w-3.5" /> {historyOpen ? t("common.close") : t("admin.viewHistory")}
        </button>
      </div>

      {historyOpen && <ListingHistoryInline listingId={listing.id} />}
    </div>
  );
}

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  reason?: string | null;
  createdAt: string;
}

/** Inline "modification history" for one listing — reads the same generic
 * `AuditLog` the Super Admin Version History panel does
 * (`GET /api/admin/entities/listing/[id]`), just scoped and pre-filled to
 * this row instead of requiring a manual id lookup elsewhere. */
function ListingHistoryInline({ listingId }: { listingId: string }) {
  const { t } = useT();
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/entities/listing/${listingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRows(d?.history ?? []))
      .catch(() => setRows([]));
  }, [listingId]);

  return (
    <div className="border-t border-neutral-200 pt-3">
      {rows === null ? (
        <p className="text-xs text-neutral-400">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-neutral-400">{t("admin.superAdmin.noHistory")}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="text-xs text-neutral-600">
              <span className="font-medium text-neutral-800">{r.action}</span>
              {r.reason && <span className="text-neutral-400"> — {r.reason}</span>}
              <span className="ml-1.5 text-neutral-400">
                · {r.actor} · {formatRelativeDate(r.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
