"use client";

import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Gem, ArrowRightLeft, Copy, History, FolderInput, Link2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import { AnalyticsSummaryInline } from "@/components/common/AnalyticsSummaryInline";
import type { Listing } from "@/lib/types";

interface PublisherOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface UnitOption {
  id: string;
  code: string;
}

/** `GET /api/admin/listings?status=all`'s shape — see that route's own doc
 * comment for why these admin-only fields sit outside the public `Listing`
 * type. `projectId` added alongside the others once a Listing could
 * optionally belong to a Project (see the schema's own doc comment on
 * `Listing.projectId`); `unitId`/`unitCode` added the same way for the
 * Unit link ("Units & Listings, Untangled"). Shared by both consumers of
 * this panel: the global Listings tab and a single Project's nested
 * listings section. */
export type AdminListingRow = Listing & {
  idleUntil: string | null;
  idleReason: string | null;
  lastRenewedAt: string;
  locationConfirmed: boolean;
  duplicateOfId: string | null;
  projectId: string | null;
  unitId: string | null;
  unitCode: string | null;
};

export const LISTING_STATUS_STYLE: Record<Listing["status"], string> = {
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
 * The full per-listing admin management surface — status transitions,
 * idle/restore, premium, transfer-to-publisher, mark duplicate, history,
 * and (once a Listing could optionally belong to a Project) move to/out
 * of a project. Originally `ListingsManagementTab`'s inline panel; shared
 * now by both the global Listings tab (every listing, any project or
 * none) and `ProjectListingsPanel` (one project's own listings) so the
 * exact same actions are available from either surface — editing a
 * listing here is the one real write path both read from, so a change
 * made from the global tab is immediately visible from inside its
 * project's own view and vice versa, no separate sync needed.
 */
export function ListingManagePanel({
  listing,
  publishers,
  projects,
  onDone,
}: {
  listing: AdminListingRow;
  publishers: PublisherOption[];
  projects: ProjectOption[];
  onDone: () => void;
}) {
  const { t } = useT();
  const [idleDays, setIdleDays] = useState(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [duplicateTarget, setDuplicateTarget] = useState("");
  const [projectSelection, setProjectSelection] = useState(listing.projectId ?? "");
  const [unitSelection, setUnitSelection] = useState(listing.unitId ?? "");
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // A Unit belongs to exactly one Project, so the picker's options depend
  // on whichever project this listing currently is (or is about to be)
  // under. Cleared synchronously during render the moment the project
  // selection itself changes (same "adjusting state when a prop/tracked
  // value changes" pattern useModelEditor.ts's syncedVersionId already
  // uses) so stale options never flash before the effect below's fetch
  // resolves; that effect then only ever fires when there's a project to
  // actually query, so it never needs a synchronous setState of its own.
  const [syncedProjectSelection, setSyncedProjectSelection] = useState(projectSelection);
  if (projectSelection !== syncedProjectSelection) {
    setSyncedProjectSelection(projectSelection);
    setUnitOptions([]);
  }
  useEffect(() => {
    if (!projectSelection) return;
    let cancelled = false;
    fetch(`/api/projects/${projectSelection}/units`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: UnitOption[]) => {
        if (!cancelled) setUnitOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setUnitOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectSelection]);

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
            type="button"
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
            type="button"
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
          type="button"
          disabled={busy || !reason.trim()}
          onClick={() => patch({ idleDays, reason })}
          className="flex items-center gap-1.5 rounded-control bg-warning/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Ban className="h-3.5 w-3.5" /> {t("admin.makeIdle")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ idleDays: 0 })}
          className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("admin.restore")}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
        <button
          type="button"
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
            type="button"
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

        {/* Projects console — move this listing to a different project, or
            back to standalone (the "— unassigned —" option, projectId:
            null). The one real write path both the global Listings tab
            and a project's own nested list read from — moving it here is
            immediately visible from the other surface too. */}
        <div className="flex items-end gap-1.5">
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.projectLabel")}</span>
            <select
              value={projectSelection}
              onChange={(e) => setProjectSelection(e.target.value)}
              className="min-w-[160px] rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
            >
              <option value="">{t("admin.unassignedOption")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={busy || projectSelection === (listing.projectId ?? "")}
            onClick={() => patch({ projectId: projectSelection || null })}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            <FolderInput className="h-3.5 w-3.5" /> {t("admin.moveToProjectAction")}
          </button>
        </div>

        {/* "Units & Listings, Untangled" — links this listing to the
            specific 3D-mapped inventory record (Unit) it's advertising.
            Options are scoped to whichever project is currently selected
            above, since a Unit always belongs to exactly one project;
            empty (and this whole control effectively inert) until a
            project is chosen. */}
        <div className="flex items-end gap-1.5">
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.linkedUnitLabel")}</span>
            <select
              value={unitSelection}
              onChange={(e) => setUnitSelection(e.target.value)}
              disabled={unitOptions.length === 0}
              className="min-w-[160px] rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">{t("admin.unassignedOption")}</option>
              {unitOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={busy || unitOptions.length === 0 || unitSelection === (listing.unitId ?? "")}
            onClick={() => patch({ unitId: unitSelection || null })}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            <Link2 className="h-3.5 w-3.5" /> {t("admin.moveToUnitAction")}
          </button>
        </div>

        {listing.duplicateOfId ? (
          <button
            type="button"
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
              type="button"
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
          type="button"
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
