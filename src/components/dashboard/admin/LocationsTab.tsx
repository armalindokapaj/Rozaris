"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, AlertTriangle, Trash2, Eye, EyeOff, Pencil } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { LOCATION_TYPES, ALLOWED_PARENT_TYPES, type LocationTypeValue } from "@/lib/locationHierarchy";
import { LocationBoundaryEditor } from "./LocationBoundaryEditor";
import { LocationMunicipalityBrowser } from "./LocationMunicipalityBrowser";

export type { LocationTypeValue };

/** `"neighborhood"` -> `"admin.locations.typeNeighborhood"`, etc. — one
 * place for the snake_case-to-key transform every type label (option
 * list, parent picker, table column) needs. Exported so
 * `LocationBoundaryEditor`/`LocationMunicipalityBrowser`'s own pickers
 * render the exact same labels. */
export function typeLabelKey(type: LocationTypeValue): string {
  const pascal = type
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  return `admin.locations.type${pascal}`;
}

export interface LocationRow {
  id: string;
  parentId: string | null;
  type: LocationTypeValue;
  officialName: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  sortOrder: number;
  childCount: number;
  propertyCount: number;
  projectCount: number;
  /** Whether a boundary is already drawn — never the geometry itself (see
   * `GET /api/admin/locations`'s own doc comment). `LocationBoundaryEditor`
   * fetches the real GeoJSON separately, only for whichever location is
   * currently selected for editing. */
  hasBoundary: boolean;
}

interface BrokenListing {
  id: string;
  slug: string;
  title: string;
  publisherName: string;
  projectId: string | null;
  projectName: string | null;
  neighborhoodId: string | null;
  city: string | null;
}

interface BrokenProject {
  id: string;
  slug: string;
  name: string;
  publisherName: string;
  neighborhoodId: string | null;
  city: string | null;
}

/**
 * Admin's write surface for the Canonical Location System (see MEMORY note
 * "rozaris-controlled-taxonomy-spec") — the ability to type in new
 * neighborhoods/cities/etc. by hand (`POST`/`PATCH /api/admin/locations*`,
 * previously only ever populated once by `scripts/seed-locations.ts`), plus
 * a "Location issues" list (`GET /api/admin/locations/issues`) that finds
 * every Listing/Project whose location doesn't resolve to a real, active
 * one any more and lets the admin fix it right here — the "fix the
 * listings and units if they have a problem" half of the same request. A
 * `Unit` has no location field of its own (it always inherits its
 * Project's), so fixing a Project's location here is also how a "broken
 * unit location" gets fixed.
 */
export function LocationsTab() {
  const { t } = useT();
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<LocationTypeValue>("neighborhood");
  const [parentId, setParentId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [adding, setAdding] = useState(false);

  // Doesn't reset `loading` to true on every call — only the initial
  // `useState(true)` above drives the first-load spinner; a reload after a
  // mutation just swaps the table's contents in place. Matters for the
  // very first call too: `useEffect(reload, [])` calling this directly
  // means any synchronous `setLoading(true)` here would fire during the
  // effect itself (react-hooks/set-state-in-effect).
  function reload() {
    fetch("/api/admin/locations")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: LocationRow[]) => {
        setRows(data);
        setError(null);
      })
      .catch(() => setError(t("admin.locations.addFailed")))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  async function handleAdd() {
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          officialName: name.trim(),
          parentId: parentId || null,
          latitude: lat.trim() ? Number(lat) : undefined,
          longitude: lng.trim() ? Number(lng) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : t("admin.locations.addFailed"));
      }
      setName("");
      setLat("");
      setLng("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.locations.addFailed"));
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(row: LocationRow) {
    const res = await fetch(`/api/admin/locations/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    if (res.ok) reload();
  }

  async function rename(row: LocationRow) {
    const next = window.prompt(t("admin.locations.renamePrompt", { name: row.officialName }), row.officialName);
    if (!next || !next.trim() || next.trim() === row.officialName) return;
    const res = await fetch(`/api/admin/locations/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ officialName: next.trim() }),
    });
    if (res.ok) reload();
    else setError(t("admin.locations.renameFailed"));
  }

  async function remove(row: LocationRow) {
    if (!window.confirm(t("admin.locations.deleteConfirm", { name: row.officialName }))) return;
    const res = await fetch(`/api/admin/locations/${row.id}`, { method: "DELETE" });
    if (res.ok) {
      reload();
    } else {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : t("admin.locations.deleteFailed"));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.locations.title")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.locations.subtitle")}</p>
      </div>

      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      <div className="space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-bold text-neutral-900">{t("admin.locations.addSectionTitle")}</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.locations.nameLabel")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("admin.locations.namePlaceholder")}
              className="w-48 rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.locations.typeLabel")}</span>
            <select
              value={type}
              onChange={(e) => {
                // The previously-picked parent may not be a legal parent
                // for the newly-picked type (e.g. switching from
                // Neighbourhood, which allows a City parent, to Village,
                // which doesn't) — reset it rather than silently submit an
                // invalid pair.
                setType(e.target.value as LocationTypeValue);
                setParentId("");
              }}
              className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
            >
              {LOCATION_TYPES.map((tp) => (
                <option key={tp} value={tp}>
                  {t(typeLabelKey(tp))}
                </option>
              ))}
            </select>
          </label>
          {/* Municipality is always top-level (no parent) — nothing to
              pick. Every other type's picker only ever offers the parent
              types that type is actually allowed to have
              (`ALLOWED_PARENT_TYPES`), so the request this form submits
              can't already be an invalid pair by the time it reaches the
              server's own copy of the same rule. */}
          {type !== "municipality" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.locations.parentLabel")}</span>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="min-w-[200px] rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
              >
                {/* No "— none —" option here — every non-Municipality type
                    requires a real parent (`ALLOWED_PARENT_TYPES`), unlike
                    the old free-for-all hierarchy. */}
                <option value="" disabled>
                  {t("admin.locations.pickParentPlaceholder")}
                </option>
                {rows
                  .filter((r) => ALLOWED_PARENT_TYPES[type].includes(r.type))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {t(typeLabelKey(r.type))} · {r.officialName}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.locations.latLabel")}</span>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              className="w-28 rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.locations.lngLabel")}</span>
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              className="w-28 rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={adding || !name.trim() || (type !== "municipality" && !parentId)}
            onClick={handleAdd}
            className="rounded-control bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {t("admin.locations.addButton")}
          </button>
        </div>
      </div>

      <div className="rounded-panel border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-100 px-5 py-3 text-sm font-bold text-neutral-900">
          {t("admin.locations.listSectionTitle")}
        </h2>
        {loading ? (
          <p className="px-5 py-4 text-sm text-neutral-400">{t("common.loading")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("admin.locations.colName")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("admin.locations.colType")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("admin.locations.colParent")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("admin.locations.colUsage")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("admin.locations.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => {
                  const inUse = r.childCount + r.propertyCount + r.projectCount > 0;
                  const parent = r.parentId ? byId.get(r.parentId) : undefined;
                  return (
                    <tr key={r.id} className={r.isActive ? undefined : "opacity-50"}>
                      <td className="px-4 py-2.5 font-medium text-neutral-800">
                        <span className="inline-flex items-center gap-1.5">
                          {r.officialName}
                          {r.hasBoundary && (
                            <span
                              title={t("admin.locations.boundaryHasOne")}
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"
                            />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500">{t(typeLabelKey(r.type))}</td>
                      <td className="px-4 py-2.5 text-neutral-500">
                        {parent?.officialName ?? t("admin.locations.topLevelParent")}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-500">
                        {t("admin.locations.usageCount", {
                          children: r.childCount,
                          properties: r.propertyCount,
                          projects: r.projectCount,
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => rename(r)}
                            title={t("admin.locations.renameAction")}
                            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(r)}
                            title={r.isActive ? t("admin.locations.deactivateAction") : t("admin.locations.activateAction")}
                            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                          >
                            {r.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            disabled={inUse}
                            onClick={() => remove(r)}
                            title={t("admin.locations.deleteAction")}
                            className="rounded-control p-1.5 text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LocationMunicipalityBrowser locations={rows} onChanged={reload} />

      <LocationBoundaryEditor locations={rows} onSaved={reload} />

      <LocationIssuesPanel activeLocations={rows.filter((r) => r.isActive)} />
    </div>
  );
}

/** "Fix the listings and units if they have a problem" — every Listing/
 * Project whose location doesn't resolve to a real, active `Location`
 * right now (`GET /api/admin/locations/issues`), each with an inline way
 * to reassign it without leaving this tab. */
function LocationIssuesPanel({ activeLocations }: { activeLocations: LocationRow[] }) {
  const { t } = useT();
  const [listings, setListings] = useState<BrokenListing[]>([]);
  const [projects, setProjects] = useState<BrokenProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Same "don't reset loading to true on every call" reasoning as
  // LocationsTab's own `reload` above.
  function reload() {
    fetch("/api/admin/locations/issues")
      .then((r) => (r.ok ? r.json() : { listings: [], projects: [] }))
      .then((data: { listings: BrokenListing[]; projects: BrokenProject[] }) => {
        setListings(data.listings);
        setProjects(data.projects);
      })
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  // Both levels — a listing/project can be assigned directly to a Village
  // with no neighborhood layer at all (2026-08-21 spec).
  const neighborhoods = activeLocations.filter((l) => l.type === "neighborhood" || l.type === "village");

  async function fixListing(l: BrokenListing) {
    const picked = choice[l.id];
    if (!picked) return;
    setBusyId(l.id);
    setError(null);
    const res = await fetch(`/api/admin/listings/${l.id}/publication`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ neighborhoodId: picked }),
    });
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : t("admin.locations.fixFailed"));
    }
    setBusyId(null);
  }

  async function resyncListing(l: BrokenListing) {
    if (!l.projectId) return;
    setBusyId(l.id);
    setError(null);
    const res = await fetch(`/api/admin/listings/${l.id}/publication`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: l.projectId }),
    });
    if (res.ok) reload();
    else setError(t("admin.locations.fixFailed"));
    setBusyId(null);
  }

  async function fixProject(p: BrokenProject) {
    const picked = choice[p.id];
    if (!picked) return;
    setBusyId(p.id);
    setError(null);
    const res = await fetch(`/api/admin/projects/${p.id}/location`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ neighborhoodId: picked }),
    });
    if (res.ok) reload();
    else {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : t("admin.locations.fixFailed"));
    }
    setBusyId(null);
  }

  const totalIssues = listings.length + projects.length;

  return (
    <div className="rounded-panel border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-3">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-bold text-neutral-900">{t("admin.locations.issuesSectionTitle")}</h2>
      </div>
      <p className="px-5 pt-3 text-xs text-neutral-500">{t("admin.locations.issuesSubtitle")}</p>
      {error && <p className="mx-5 mt-3 rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      {loading ? (
        <p className="px-5 py-4 text-sm text-neutral-400">{t("common.loading")}</p>
      ) : totalIssues === 0 ? (
        <p className="px-5 py-4 text-sm text-neutral-500">{t("admin.locations.issuesEmpty")}</p>
      ) : (
        <div className="space-y-4 p-5">
          {listings.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {t("admin.locations.issuesListingsTitle")}
              </p>
              <div className="space-y-2">
                {listings.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-control border border-neutral-200 p-2.5">
                    <div className="min-w-[160px] flex-1">
                      <p className="text-sm font-medium text-neutral-800">{l.title}</p>
                      <p className="text-xs text-neutral-400">
                        {l.publisherName} · {t("admin.locations.currentLabel")}: {l.city || l.neighborhoodId || t("admin.locations.noLocationValue")}
                      </p>
                    </div>
                    {l.projectId ? (
                      <>
                        <span className="text-xs text-neutral-400">
                          {t("admin.locations.belongsToProjectNote", { project: l.projectName ?? l.projectId ?? "" })}
                        </span>
                        <button
                          type="button"
                          disabled={busyId === l.id}
                          onClick={() => resyncListing(l)}
                          className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                        >
                          {t("admin.locations.resyncFromProjectAction")}
                        </button>
                      </>
                    ) : (
                      <>
                        <select
                          value={choice[l.id] ?? ""}
                          onChange={(e) => setChoice((c) => ({ ...c, [l.id]: e.target.value }))}
                          className="min-w-[180px] rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
                        >
                          <option value="">{t("admin.locations.assignPickerPlaceholder")}</option>
                          {neighborhoods.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.officialName}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busyId === l.id || !choice[l.id]}
                          onClick={() => fixListing(l)}
                          className="rounded-control bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                        >
                          {t("admin.locations.assignAction")}
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {projects.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {t("admin.locations.issuesProjectsTitle")}
              </p>
              <div className="space-y-2">
                {projects.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-control border border-neutral-200 p-2.5">
                    <div className="min-w-[160px] flex-1">
                      <p className="text-sm font-medium text-neutral-800">{p.name}</p>
                      <p className="text-xs text-neutral-400">
                        {p.publisherName} · {t("admin.locations.currentLabel")}: {p.city || p.neighborhoodId || t("admin.locations.noLocationValue")}
                      </p>
                    </div>
                    <select
                      value={choice[p.id] ?? ""}
                      onChange={(e) => setChoice((c) => ({ ...c, [p.id]: e.target.value }))}
                      className="min-w-[180px] rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
                    >
                      <option value="">{t("admin.locations.assignPickerPlaceholder")}</option>
                      {neighborhoods.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.officialName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busyId === p.id || !choice[p.id]}
                      onClick={() => fixProject(p)}
                      className="rounded-control bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                    >
                      {t("admin.locations.assignAction")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
