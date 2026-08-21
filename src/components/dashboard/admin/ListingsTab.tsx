"use client";

import { Fragment, useEffect, useState } from "react";
import { Gem, Plus } from "lucide-react";
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
          {view === "listings" && (
            <div className="flex gap-1.5">
              {(["all", "unassigned"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
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
          )}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {units.map((u) => (
                <tr key={u.id}>
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
                </tr>
              ))}
              {units.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-400">
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
  const [floor, setFloor] = useState(1);
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [area, setArea] = useState(60);
  const [price, setPrice] = useState(80000);
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

  const canSave = projectId !== "" && code.trim() !== "" && buildingName !== "" && area > 0 && price > 0;

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
          floor,
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
              <input
                type="number"
                value={floor}
                min={0}
                onChange={(e) => setFloor(Number(e.target.value))}
                className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
              />
            </Field>
            <Field label={t("unit.beds")}>
              <input
                type="number"
                value={bedrooms}
                min={0}
                onChange={(e) => setBedrooms(Number(e.target.value))}
                className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
              />
            </Field>
            <Field label={t("unit.baths")}>
              <input
                type="number"
                value={bathrooms}
                min={0}
                onChange={(e) => setBathrooms(Number(e.target.value))}
                className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
              />
            </Field>
            <Field label={t("filters.areaM2")}>
              <input
                type="number"
                value={area}
                min={1}
                onChange={(e) => setArea(Number(e.target.value))}
                className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
              />
            </Field>
            <Field label={t("dashboard.priceLabel")}>
              <input
                type="number"
                value={price}
                min={1}
                step={1000}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
              />
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
