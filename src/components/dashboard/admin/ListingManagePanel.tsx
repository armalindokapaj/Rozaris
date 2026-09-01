"use client";

import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Gem, ArrowRightLeft, Copy, History, FolderInput, Link2, MapPin, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatRelativeDate } from "@/lib/utils";
import { AnalyticsSummaryInline } from "@/components/common/AnalyticsSummaryInline";
import { useLocations } from "@/hooks/useLocations";
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
  projectId: string;
  projectName: string;
}

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
  const neighborhoods = useLocations(["neighborhood", "village"]);
  const [neighborhoodSelection, setNeighborhoodSelection] = useState(listing.neighborhoodId ?? "");
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/units")
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
  }, []);

  const unitOptionsByProject = new Map<string, { projectName: string; units: UnitOption[] }>();
  for (const u of unitOptions) {
    if (!unitOptionsByProject.has(u.projectId)) {
      unitOptionsByProject.set(u.projectId, { projectName: u.projectName, units: [] });
    }
    unitOptionsByProject.get(u.projectId)!.units.push(u);
  }

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

        {                                                                  
                                                              }
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

        {                                                            
                                               }
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
              {Array.from(unitOptionsByProject.entries()).map(([projectId, group]) => (
                <optgroup key={projectId} label={group.projectName}>
                  {group.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={busy || unitOptions.length === 0 || unitSelection === (listing.unitId ?? "")}
            onClick={() => {
              const chosen = unitOptions.find((u) => u.id === unitSelection);
              const derivedProjectId = unitSelection ? (chosen?.projectId ?? null) : (projectSelection || null);
              const body: Record<string, unknown> = { unitId: unitSelection || null };
              if (derivedProjectId !== (listing.projectId ?? null)) {
                body.projectId = derivedProjectId;
              }
              patch(body);
            }}
            className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            <Link2 className="h-3.5 w-3.5" /> {t("admin.moveToUnitAction")}
          </button>
        </div>

        {                                                                   
                                                                    }
        <div className="flex items-end gap-1.5">
          {listing.projectId ? (
            <>
              <p className="max-w-[220px] text-xs text-neutral-500">
                {t("admin.locations.belongsToProjectNote", {
                  project: projects.find((p) => p.id === listing.projectId)?.name ?? listing.projectId,
                })}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ projectId: listing.projectId })}
                className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {t("admin.locations.resyncFromProjectAction")}
              </button>
            </>
          ) : (
            <>
              <div>
                <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.locations.locationLabel")}</span>
                <select
                  value={neighborhoodSelection}
                  onChange={(e) => setNeighborhoodSelection(e.target.value)}
                  className="min-w-[160px] rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
                >
                  <option value="">{t("admin.locations.assignPickerPlaceholder")}</option>
                  {neighborhoods.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.officialName}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={busy || !neighborhoodSelection || neighborhoodSelection === (listing.neighborhoodId ?? "")}
                onClick={() => patch({ neighborhoodId: neighborhoodSelection })}
                className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                <MapPin className="h-3.5 w-3.5" /> {t("admin.locations.reassignAction")}
              </button>
            </>
          )}
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
