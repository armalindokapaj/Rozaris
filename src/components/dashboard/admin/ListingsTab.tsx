"use client";

import { Fragment, useEffect, useState } from "react";
import { Check, Gem, Pencil, Plus, Trash2, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useAdminPublishers } from "@/hooks/useAdminPublishers";
import { isListingIdle, isListingStale } from "@/lib/moderation";
import { NewListingForm } from "@/components/dashboard/NewListingForm";
import { ListingManagePanel, LISTING_STATUS_STYLE, type AdminListingRow } from "@/components/dashboard/admin/ListingManagePanel";
import type { Unit } from "@/lib/types";

interface ProjectOption {
  id: string;
  name: string;
  /** Needed only by the "New unit" form's building picker below — the
   * admin projects list already returns this (`normalizeProject`), so no
   * separate fetch. */
  buildings: string[];
}

/** `GET /api/admin/units`'s shape — every real Unit, whichever project it's
 * under, plus every real (non-deleted) Listing currently advertising it.
 * `listings` is an array rather than a single nullable id: a Unit needs no
 * listing to exist, and nothing stops two listings pointing at the same
 * one (re-listed by a different agency) — both are worth surfacing here,
 * not hidden behind a single "linked" flag. */
interface AdminUnitRow {
  id: string;
  code: string;
  type: Unit["type"];
  buildingName: string;
  floor: number;
  status: string;
  price: number;
  currency: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  transaction: string;
  projectId: string;
  projectName: string;
  listings: { id: string; title: string; status: AdminListingRow["status"] }[];
}

const UNIT_STATUS_STYLE: Record<string, string> = {
  available: "bg-green-100 text-green-700",
  reserved: "bg-amber-100 text-amber-700",
  sold: "bg-neutral-100 text-neutral-500",
};

/**
 * Admin's platform-wide Listings overview — every real listing regardless
 * of project, who published it, and (once a Listing could optionally
 * belong to a Project) which project it's under, if any. Sits directly
 * below "Projects" in the left nav: the per-project `ProjectListingsPanel`
 * nested in `EditProjectModal` is where a listing is normally managed once
 * it's attached, but a listing that was never put in its project (or one
 * that stands alone on purpose) has nowhere else to be found or fixed —
 * this is that catch-all. Shares `ListingManagePanel` with
 * `ProjectListingsPanel`, so a move made from either surface is
 * immediately visible from the other; both just re-read the same
 * `GET /api/admin/listings?status=all`.
 */
export function ListingsTab() {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const { publishers } = useAdminPublishers("");
  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [units, setUnits] = useState<AdminUnitRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [managing, setManaging] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<"all" | "unassigned">("all");
  const [view, setView] = useState<"listings" | "units">("listings");
  const [creating, setCreating] = useState(false);

  // "New listing" from this global tab has no single project to inherit a
  // publisher/unit scope from (unlike ProjectListingsPanel, which always
  // has `project.developer.id` and that project's own units on hand) — so
  // creation here starts with its own small publisher + project picker,
  // then reuses the same `NewListingForm` every other creation surface
  // does. Publisher is required (`NewListingForm.publisherId` isn't
  // optional); project is not.
  const [newListingPublisherId, setNewListingPublisherId] = useState("");
  const [newListingProjectId, setNewListingProjectId] = useState("");
  const [newListingUnitOptions, setNewListingUnitOptions] = useState<{ id: string; code: string }[]>([]);
  // Publisher and project are picked together on one small screen before
  // `NewListingForm` itself appears — a separate `ready` flag (rather than
  // switching the moment a publisher is chosen) so picking publisher first
  // doesn't yank the project picker away before it's had a chance to be
  // used, whichever order the admin fills them in.
  const [newListingReady, setNewListingReady] = useState(false);
  // Same "adjusting state during render" pattern ListingManagePanel's own
  // unit picker uses (see its `syncedProjectSelection`) — clears stale
  // options synchronously the moment the project selection itself changes,
  // so the effect below only ever needs to run when there's a project to
  // actually query.
  const [syncedNewListingProjectId, setSyncedNewListingProjectId] = useState(newListingProjectId);
  if (newListingProjectId !== syncedNewListingProjectId) {
    setSyncedNewListingProjectId(newListingProjectId);
    setNewListingUnitOptions([]);
  }
  useEffect(() => {
    if (!newListingProjectId) return;
    let cancelled = false;
    fetch(`/api/projects/${newListingProjectId}/units`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; code: string }[]) => {
        if (!cancelled) setNewListingUnitOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setNewListingUnitOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [newListingProjectId]);

  function refresh() {
    fetch("/api/admin/listings?status=all")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: AdminListingRow[]) => setListings(rows))
      .catch(() => {});
    fetch("/api/admin/units")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: AdminUnitRow[]) => setUnits(rows))
      .catch(() => {});
  }

  useEffect(refresh, []);
  useEffect(() => {
    fetch("/api/admin/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectOption[]) => setProjects(rows))
      .catch(() => {});
  }, []);

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const visible = projectFilter === "unassigned" ? listings.filter((l) => !l.projectId) : listings;

  /** Jumps from a Unit row's linked-listing chip straight to that
   * listing's own manage panel, so a mismatch spotted while auditing
   * Units ("why does this unit show sold with no listing?") can be fixed
   * without hunting for it by hand in the Listings view. */
  function openListingFromUnit(listingId: string) {
    setView("listings");
    setProjectFilter("all");
    setManaging(listingId);
  }

  // Full unit edit, from this platform-wide view — the only Unit edit
  // surface before this was `ProjectUnitsEditor.tsx`, reachable only from
  // inside a project's own edit modal. Same `PATCH
  // /api/projects/[projectId]/units/[unitId]` write path (real audit log +
  // inventory-revision bump), just a wider field set (type/currency/
  // transaction included, which that editor's own inline form leaves out).
  type UnitEditDraft = Pick<
    AdminUnitRow,
    "code" | "type" | "buildingName" | "bedrooms" | "bathrooms" | "currency" | "transaction" | "status"
  > & {
    // "" while the field is mid-edit-and-cleared — see ClearableNumber's
    // own doc comment for why floor/area/price need this and
    // bedrooms/bathrooms (a fixed dropdown, always has a real value) don't.
    floor: number | "";
    area: number | "";
    price: number | "";
  };
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitDraft, setUnitDraft] = useState<UnitEditDraft | null>(null);
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitEditError, setUnitEditError] = useState<string | null>(null);

  function startEditUnit(u: AdminUnitRow) {
    setEditingUnitId(u.id);
    setUnitEditError(null);
    setUnitDraft({
      code: u.code,
      type: u.type,
      buildingName: u.buildingName,
      floor: u.floor,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      area: u.area,
      price: u.price,
      currency: u.currency,
      transaction: u.transaction,
      status: u.status,
    });
  }

  function cancelEditUnit() {
    setEditingUnitId(null);
    setUnitDraft(null);
    setUnitEditError(null);
  }

  async function saveEditUnit(u: AdminUnitRow) {
    if (
      !unitDraft ||
      !unitDraft.code.trim() ||
      unitDraft.area === "" ||
      unitDraft.area <= 0 ||
      unitDraft.price === "" ||
      unitDraft.price <= 0
    )
      return;
    setUnitSaving(true);
    setUnitEditError(null);
    try {
      const res = await fetch(`/api/projects/${u.projectId}/units/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...unitDraft,
          code: unitDraft.code.trim(),
          floor: unitDraft.floor === "" ? 0 : unitDraft.floor,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ? JSON.stringify(body.error) : "Could not save the unit — try again.");
      }
      cancelEditUnit();
      refresh();
    } catch (err) {
      setUnitEditError(err instanceof Error ? err.message : "Could not save the unit — try again.");
    } finally {
      setUnitSaving(false);
    }
  }

  async function deleteUnitRow(u: AdminUnitRow) {
    const res = await fetch(`/api/projects/${u.projectId}/units/${u.id}`, { method: "DELETE" });
    if (res.ok) refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-serif text-xl text-neutral-900">{t("admin.listingsMgmtTitle")}</h1>
          <p className="text-sm text-neutral-500">
            {view === "units" ? t("admin.unitsAuditSubtitle") : t("admin.listingsMgmtSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {(["listings", "units"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  setCreating(false);
                }}
                className={`rounded-pill border px-3 py-1.5 text-xs font-semibold ${
                  view === v
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                }`}
              >
                {v === "listings" ? t("admin.listingsViewTab") : t("admin.unitsViewTab")}
              </button>
            ))}
          </div>
          {/* Kept mounted (just hidden) rather than conditionally removed
              when view !== "listings" — this group sits inside a
              `justify-between` row that's otherwise anchored to the far
              right, so unmounting it used to shrink the whole button
              cluster's width and visibly shift the Listings/Units toggle
              rightward every time "Units" was clicked. `invisible` keeps
              its reserved width so nothing else in the row moves. */}
          <div className={`flex gap-1.5 ${view === "listings" ? "" : "invisible"}`} aria-hidden={view !== "listings"}>
            {(["all", "unassigned"] as const).map((f) => (
              <button
                key={f}
                type="button"
                disabled={view !== "listings"}
                tabIndex={view === "listings" ? 0 : -1}
                onClick={() => setProjectFilter(f)}
                className={`rounded-pill border px-3 py-1.5 text-xs font-semibold ${
                  projectFilter === f
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                }`}
              >
                {f === "all" ? t("admin.allListingsFilter") : t("admin.unassignedListingsFilter")}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 rounded-control bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> {view === "units" ? t("admin.newUnit") : t("admin.newListing")}
          </button>
        </div>
      </div>

      {creating && view === "listings" && (
        <div className="rounded-panel border border-neutral-200 bg-neutral-50 p-3">
          {!newListingReady ? (
            <div className="space-y-3">
              <label className="block max-w-xs">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.postingOnBehalfOf")}</span>
                <select
                  value={newListingPublisherId}
                  onChange={(e) => setNewListingPublisherId(e.target.value)}
                  className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-sm"
                >
                  <option value="">{t("admin.selectPublisher")}</option>
                  {publishers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block max-w-xs">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.projectLabel")}</span>
                <select
                  value={newListingProjectId}
                  onChange={(e) => setNewListingProjectId(e.target.value)}
                  className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-sm"
                >
                  <option value="">{t("admin.unassignedOption")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!newListingPublisherId}
                  onClick={() => setNewListingReady(true)}
                  className="rounded-control bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {t("common.continue")}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <NewListingForm
              publisherId={newListingPublisherId}
              projectId={newListingProjectId || undefined}
              unitOptions={newListingUnitOptions}
              onSaved={() => {
                setCreating(false);
                setNewListingReady(false);
                setNewListingPublisherId("");
                setNewListingProjectId("");
                refresh();
              }}
              onCancel={() => {
                setCreating(false);
                setNewListingReady(false);
                setNewListingPublisherId("");
                setNewListingProjectId("");
              }}
            />
          )}
        </div>
      )}

      {creating && view === "units" && (
        <NewUnitForm
          projects={projects}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {view === "units" ? (
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("admin.projectLabel")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.colBuilding")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.colUnitCode")}</th>
                <th className="px-4 py-2.5 font-medium">{t("dashboard.priceLabel")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.colStatus")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.colLinkedListings")}</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {units.map((u) => (
                <Fragment key={u.id}>
                  <tr>
                    <td className="px-4 py-3 text-neutral-600">{u.projectName}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {u.buildingName} · {u.floor}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800">{u.code}</td>
                    <td className="px-4 py-3 tabular-nums text-neutral-600">{priceFmt(u.price)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          UNIT_STATUS_STYLE[u.status] ?? "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.listings.length === 0 ? (
                        <span className="text-neutral-400">{t("admin.noLinkedListings")}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.listings.map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => openListingFromUnit(l.id)}
                              className={`rounded-full px-2 py-1 text-xs font-semibold hover:opacity-80 ${LISTING_STATUS_STYLE[l.status]}`}
                              title={l.title}
                            >
                              {l.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => (editingUnitId === u.id ? cancelEditUnit() : startEditUnit(u))}
                          aria-label={t("common.edit")}
                          className="rounded-full p-1.5 text-neutral-400 hover:bg-brand-50 hover:text-brand-600"
                        >
                          {editingUnitId === u.id ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteUnitRow(u)}
                          aria-label={t("common.close")}
                          className="rounded-full p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingUnitId === u.id && unitDraft && (
                    <tr>
                      <td colSpan={7} className="bg-neutral-50 px-4 py-4">
                        {unitEditError && (
                          <p className="mb-2.5 rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                            {unitEditError}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                          <Field label={t("admin.unitCode")}>
                            <input
                              value={unitDraft.code}
                              onChange={(e) => setUnitDraft({ ...unitDraft, code: e.target.value })}
                              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                            />
                          </Field>
                          <Field label={t("unit.viewerBuilding")}>
                            <input
                              value={unitDraft.buildingName}
                              onChange={(e) => setUnitDraft({ ...unitDraft, buildingName: e.target.value })}
                              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                            />
                          </Field>
                          <Field label={t("listing.floor")}>
                            <ClearableNumber
                              value={unitDraft.floor}
                              onChange={(v) => setUnitDraft({ ...unitDraft, floor: v })}
                            />
                          </Field>
                          <Field label={t("unit.beds")}>
                            <CountSelect
                              value={unitDraft.bedrooms}
                              onChange={(v) => setUnitDraft({ ...unitDraft, bedrooms: v })}
                            />
                          </Field>
                          <Field label={t("unit.baths")}>
                            <CountSelect
                              value={unitDraft.bathrooms}
                              onChange={(v) => setUnitDraft({ ...unitDraft, bathrooms: v })}
                            />
                          </Field>
                          <Field label={t("filters.areaM2")}>
                            <ClearableNumber
                              value={unitDraft.area}
                              min={1}
                              onChange={(v) => setUnitDraft({ ...unitDraft, area: v })}
                            />
                          </Field>
                          <Field label={t("dashboard.priceLabel")}>
                            <ClearableNumber
                              value={unitDraft.price}
                              min={1}
                              step={1000}
                              onChange={(v) => setUnitDraft({ ...unitDraft, price: v })}
                            />
                          </Field>
                          <Field label={t("admin.currencyLabel")}>
                            <select
                              value={unitDraft.currency}
                              onChange={(e) => setUnitDraft({ ...unitDraft, currency: e.target.value })}
                              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                            >
                              <option value="EUR">EUR</option>
                              <option value="ALL">ALL</option>
                            </select>
                          </Field>
                          <Field label={t("admin.unitTypeLabel")}>
                            <select
                              value={unitDraft.type}
                              onChange={(e) => setUnitDraft({ ...unitDraft, type: e.target.value as Unit["type"] })}
                              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                            >
                              <option value="residential">{t("admin.unitTypeResidential")}</option>
                              <option value="commercial">{t("admin.unitTypeCommercial")}</option>
                              <option value="parking">{t("admin.unitTypeParking")}</option>
                              <option value="storage">{t("admin.unitTypeStorage")}</option>
                            </select>
                          </Field>
                          <Field label={t("admin.transactionLabel")}>
                            <select
                              value={unitDraft.transaction}
                              onChange={(e) => setUnitDraft({ ...unitDraft, transaction: e.target.value })}
                              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                            >
                              <option value="sale">{t("admin.transactionSale")}</option>
                              <option value="rent">{t("admin.transactionRent")}</option>
                              <option value="coming_soon">{t("admin.transactionComingSoon")}</option>
                            </select>
                          </Field>
                          <Field label={t("unit.viewerAvailability")}>
                            <select
                              value={unitDraft.status}
                              onChange={(e) => setUnitDraft({ ...unitDraft, status: e.target.value })}
                              className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                            >
                              <option value="available">{t("unit.statusAvailable")}</option>
                              <option value="reserved">{t("unit.statusReserved")}</option>
                              <option value="sold">{t("unit.statusSold")}</option>
                            </select>
                          </Field>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveEditUnit(u)}
                            disabled={
                              unitSaving ||
                              !unitDraft.code.trim() ||
                              unitDraft.area === "" ||
                              unitDraft.area <= 0 ||
                              unitDraft.price === "" ||
                              unitDraft.price <= 0
                            }
                            className="flex items-center gap-1.5 rounded-control bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {unitSaving ? t("dashboard.saving") : t("common.save")}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditUnit}
                            className="rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                          >
                            {t("common.cancel")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {units.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-400">
                    {t("admin.noUnitsYet")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.titleLabel")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colPublisher")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.projectLabel")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.linkedUnitLabel")}</th>
              <th className="px-4 py-2.5 font-medium">{t("dashboard.priceLabel")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.colStatus")}</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {visible.map((l) => (
              <Fragment key={l.id}>
                <tr>
                  <td className="px-4 py-3 font-medium text-neutral-800">{l.title}</td>
                  <td className="px-4 py-3 text-neutral-600">{l.publisher.name}</td>
                  <td className="px-4 py-3">
                    {l.projectId ? (
                      <span className="text-neutral-600">{projectNameById.get(l.projectId) ?? l.projectId}</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                        {t("admin.unassignedOption")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {l.unitCode ?? <span className="text-neutral-400">{t("admin.unassignedOption")}</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-neutral-600">{priceFmt(l.price)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${LISTING_STATUS_STYLE[l.status]}`}>
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
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setManaging(managing === l.id ? null : l.id)}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {managing === l.id ? t("common.close") : t("admin.manage")}
                    </button>
                  </td>
                </tr>
                {managing === l.id && (
                  <tr>
                    <td colSpan={7} className="bg-neutral-50 px-4 py-4">
                      <ListingManagePanel listing={l} publishers={publishers} projects={projects} onDone={refresh} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-400">
                  {t("admin.noListingsYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

/**
 * Global-Listings-tab counterpart to `ProjectUnitsEditor.tsx`'s own inline
 * "add unit" form — same fields, same `POST /api/projects/[projectId]/units`
 * shape, but this one starts with no project of its own to write into, so
 * it needs its own project picker up front (`Unit.projectId` is required)
 * before the rest of the fields make sense. Not reachable from anywhere
 * project-scoped (project detail's own Units panel stays the normal way
 * to add a unit while working inside one project); this exists so a unit
 * can be created without leaving the platform-wide audit view.
 */
function NewUnitForm({
  projects,
  onSaved,
  onCancel,
}: {
  projects: { id: string; name: string; buildings: string[] }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [projectId, setProjectId] = useState("");
  const [code, setCode] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [floor, setFloor] = useState<number | "">(1);
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [area, setArea] = useState<number | "">(60);
  const [price, setPrice] = useState<number | "">(80000);
  const [status, setStatus] = useState<Unit["status"]>("available");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildings = projects.find((p) => p.id === projectId)?.buildings ?? [];
  // The building select needs a real option to sit on — reset to this
  // project's first building whenever the project changes (including away
  // from one with no buildings at all, where it clears back to "").
  const [syncedProjectId, setSyncedProjectId] = useState(projectId);
  if (projectId !== syncedProjectId) {
    setSyncedProjectId(projectId);
    setBuildingName(buildings[0] ?? "");
  }

  const canSave =
    projectId !== "" && code.trim() !== "" && buildingName !== "" && area !== "" && area > 0 && price !== "" && price > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `${projectId}-unit-${Date.now()}`,
          code: code.trim(),
          type: "residential",
          buildingName,
          floor: floor === "" ? 0 : floor,
          area,
          bedrooms,
          bathrooms,
          price,
          currency: "EUR",
          transaction: "sale",
          status,
          images: [],
          floorPlanImage: "",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ? JSON.stringify(body.error) : "Could not create the unit — try again.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the unit — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-panel border border-neutral-200 bg-neutral-50 p-3">
      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
      <label className="block max-w-xs">
        <span className="mb-1.5 block text-xs font-medium text-neutral-500">{t("admin.projectLabel")}</span>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-sm"
        >
          <option value="">{t("admin.selectProjectPlaceholder")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {projectId === "" ? (
        <p className="text-xs text-neutral-400">{t("admin.selectProjectFirst")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Field label={t("admin.unitCode")}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="A-101"
                className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
              />
            </Field>
            <Field label={t("unit.viewerBuilding")}>
              {buildings.length > 0 ? (
                <select
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                >
                  {buildings.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  placeholder="A"
                  className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                />
              )}
            </Field>
            <Field label={t("listing.floor")}>
              <ClearableNumber value={floor} min={0} onChange={setFloor} />
            </Field>
            <Field label={t("unit.beds")}>
              <CountSelect value={bedrooms} onChange={setBedrooms} />
            </Field>
            <Field label={t("unit.baths")}>
              <CountSelect value={bathrooms} onChange={setBathrooms} />
            </Field>
            <Field label={t("filters.areaM2")}>
              <ClearableNumber value={area} min={1} onChange={setArea} />
            </Field>
            <Field label={t("dashboard.priceLabel")}>
              <ClearableNumber value={price} min={1} step={1000} onChange={setPrice} />
            </Field>
            <Field label={t("unit.viewerAvailability")}>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Unit["status"])}
                className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
              >
                <option value="available">{t("unit.statusAvailable")}</option>
                <option value="reserved">{t("unit.statusReserved")}</option>
                <option value="sold">{t("unit.statusSold")}</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="rounded-control bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              {saving ? t("dashboard.saving") : t("admin.addUnit")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-control border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
            >
              {t("common.cancel")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

/** A number input that starts with a sensible non-zero default (floor 1,
 * price 80000, …) but doesn't fight you when you want to replace it: value
 * is `number | ""` so backspacing all the way actually empties the field
 * instead of snapping back to "0" and leaving a digit for the next
 * keystroke to collide with (typing "6" over a stuck "0" landing as "06")
 * — and focusing the field selects its current text, so a single
 * keystroke replaces the whole default instead of inserting into it. */
function ClearableNumber({
  value,
  onChange,
  min,
  step = 1,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      step={step}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
    />
  );
}

/** Bedrooms/bathrooms as a real dropdown (0/1/2/3/4) rather than a free-
 * typed number field — nothing about "how many bathrooms" benefits from
 * the same clear/retype friction as price or floor. If the current value
 * is already outside 0-4 (an existing unit edited from elsewhere), it's
 * added as its own option rather than silently dropped, so opening the
 * edit panel on a real 5+ bedroom unit never looks like data went missing. */
function CountSelect({ value, onChange, max = 4 }: { value: number; onChange: (v: number) => void; max?: number }) {
  const options = Array.from({ length: max + 1 }, (_, i) => i);
  if (!options.includes(value)) options.push(value);
  options.sort((a, b) => a - b);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
    >
      {options.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
