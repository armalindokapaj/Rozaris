"use client";

import { Fragment, useEffect, useState } from "react";
import { Gem } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useAdminPublishers } from "@/hooks/useAdminPublishers";
import { isListingIdle, isListingStale } from "@/lib/moderation";
import { ListingManagePanel, LISTING_STATUS_STYLE, type AdminListingRow } from "@/components/dashboard/admin/ListingManagePanel";

interface ProjectOption {
  id: string;
  name: string;
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
                onClick={() => setView(v)}
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
        </div>
      </div>

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
