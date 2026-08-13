"use client";

import { cn, formatPrice } from "@/lib/utils";
import { autoMatchUnitNodes } from "@/lib/glbUnitNodes";
import type { Project3DConfig, Unit } from "@/lib/types";
import { ColorField } from "../fields";
import type { FloorFilter, SetOpts, Translate } from "../editorTypes";

const STATUS_KEY: Record<Unit["status"], string> = {
  available: "unit.statusAvailable",
  reserved: "unit.statusReserved",
  sold: "unit.statusSold",
};

const STATUS_BADGE: Record<Unit["status"], string> = {
  available: "bg-green-100 text-green-700",
  reserved: "bg-amber-100 text-amber-700",
  sold: "bg-neutral-200 text-neutral-600",
};

/**
 * Inventory mode panel (Inventory/Floors mockup pass, 2026-08-13) —
 * reorganized from the old flat "Link Units" panel into the mockup's
 * left-sidebar sub-nav, reproduced here as stacked sections since this
 * tab's content lives in the right rail now (the left rail is
 * building/floor navigation only — `BuildingNavRail.tsx`):
 * Unit Blocks (new, plain real table) / Unit Bindings (the original
 * mesh-name → unit linking table) / Unit Display (the original status
 * colors) / Filters / Floors & Sections (a pointer to the real Sections
 * tab — see modes.ts — which shipped the cut-plane authoring this
 * section used to describe as a future PRD).
 * `selectedFloor` (from the left rail) filters Unit Blocks always, and
 * Unit Bindings for *linked* rows only — a mesh with no unit linked yet
 * has no floor to filter by, so it stays visible regardless (hiding it
 * would fight the needs-review workflow below).
 */
export function UnitsPanel({
  units,
  detectedNodes,
  nodesLoading,
  matchedCount,
  needsReviewCount,
  visibleNodes,
  showOnlyNeedsReview,
  setShowOnlyNeedsReview,
  canEditDetail,
  linkSelections,
  setLinkSelections,
  carriedMeshNames,
  setCarriedMeshNames,
  draft,
  update,
  selectedFloor,
  setSelectedFloor,
  t,
}: {
  units: Unit[];
  detectedNodes: string[] | null;
  nodesLoading: boolean;
  matchedCount: number;
  needsReviewCount: number;
  visibleNodes: string[];
  showOnlyNeedsReview: boolean;
  setShowOnlyNeedsReview: (v: boolean | ((prev: boolean) => boolean)) => void;
  canEditDetail: boolean;
  linkSelections: Record<string, string>;
  setLinkSelections: (
    v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>),
    opts?: SetOpts
  ) => void;
  carriedMeshNames: Set<string>;
  setCarriedMeshNames: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  draft: Project3DConfig;
  update: (partial: Partial<Project3DConfig>, opts?: SetOpts) => void;
  selectedFloor: FloorFilter | null;
  setSelectedFloor: (v: FloorFilter | null) => void;
  t: Translate;
}) {
  const floorFilteredUnits = selectedFloor
    ? units.filter((u) => u.buildingName === selectedFloor.building && u.floor === selectedFloor.floor)
    : units;

  const floorFilteredMeshNames = selectedFloor
    ? visibleNodes.filter((meshName) => {
        const unitId = linkSelections[meshName];
        if (!unitId) return true; // unlinked — no floor to filter by, keep visible
        const u = units.find((x) => x.id === unitId);
        return u?.buildingName === selectedFloor.building && u?.floor === selectedFloor.floor;
      })
    : visibleNodes;

  return (
    <div className="space-y-6">
      {/* --- Unit Blocks — plain real table, new. --- */}
      <section>
        <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.inventoryUnitBlocksTitle")}
        </h4>
        {floorFilteredUnits.length === 0 ? (
          <p className="text-xs text-neutral-400">{t("admin.inventoryNoUnits")}</p>
        ) : (
          <div className="overflow-x-auto rounded-control border border-neutral-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-100 bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-2.5 py-1.5 font-semibold">{t("dashboard.colUnit")}</th>
                  <th className="px-2.5 py-1.5 font-semibold">{t("dashboard.colFloor")}</th>
                  <th className="px-2.5 py-1.5 font-semibold">{t("dashboard.colStatus")}</th>
                  <th className="px-2.5 py-1.5 font-semibold">{t("dashboard.colPrice")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {floorFilteredUnits.map((u) => (
                  <tr key={u.id}>
                    <td className="px-2.5 py-1.5 font-semibold text-neutral-800">{u.code}</td>
                    <td className="px-2.5 py-1.5 text-neutral-600">{u.floor}</td>
                    <td className="px-2.5 py-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", STATUS_BADGE[u.status])}>
                        {t(STATUS_KEY[u.status])}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-neutral-600">{formatPrice(u.price, u.currency, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Unit Bindings — the original mesh-name → unit linking table. --- */}
      <section className="border-t border-neutral-100 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            {t("admin.detailModelLinkUnitsTitle")}
          </h4>
          {detectedNodes && (
            <span className="text-xs font-medium text-neutral-500">
              {t("admin.detailModelLinkSummary", {
                detected: detectedNodes.length,
                matched: matchedCount,
                needsReview: needsReviewCount,
              })}
            </span>
          )}
        </div>

        {!nodesLoading && detectedNodes && detectedNodes.length > 0 && (
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!canEditDetail}
              onClick={() => setLinkSelections((s) => autoMatchUnitNodes(detectedNodes, units, s), { commit: true })}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              {t("admin.detailModelAutoMatch")}
            </button>
          </div>
        )}

        {nodesLoading && <p className="text-xs text-neutral-400">{t("admin.detailModelDetecting")}</p>}
        {!nodesLoading && detectedNodes && detectedNodes.length === 0 && (
          <p className="text-xs text-neutral-400">{t("admin.detailModelNoNodes")}</p>
        )}
        {!nodesLoading && detectedNodes && detectedNodes.length > 0 && (
          <div className="space-y-2">
            {floorFilteredMeshNames.map((meshName) => (
              <div key={meshName} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate font-mono text-xs text-neutral-600">{meshName}</span>
                <select
                  disabled={!canEditDetail}
                  value={linkSelections[meshName] ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLinkSelections((s) => ({ ...s, [meshName]: value }), { commit: true });
                    // A manual choice is a real review, even for a node that
                    // was only ever auto-"carried" — without this the amber
                    // badge would stay stuck forever once carried, regardless
                    // of what Admin does with the dropdown next.
                    setCarriedMeshNames((s) => {
                      if (!s.has(meshName)) return s;
                      const next = new Set(s);
                      next.delete(meshName);
                      return next;
                    });
                  }}
                  className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none disabled:opacity-50"
                >
                  <option value="">{t("admin.detailModelUnlinked")}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} · {t("admin.detailModelFloorLabel", { floor: u.floor })} ·{" "}
                      {t(`unit.status${u.status[0].toUpperCase()}${u.status.slice(1)}`)}
                    </option>
                  ))}
                </select>
                {!linkSelections[meshName] ? (
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                    {t("admin.mappingNeedsReview")}
                  </span>
                ) : (
                  carriedMeshNames.has(meshName) && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      {t("admin.mappingCarried")}
                    </span>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Unit Display — the original 4 status-color fields. --- */}
      <section className="border-t border-neutral-100 pt-5">
        <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.inventoryUnitDisplayTitle")}
        </h4>
        <div className="space-y-2.5">
          <ColorField
            label={t("unit.statusAvailable")}
            value={draft.unitColorAvailable}
            onChange={(v) => update({ unitColorAvailable: v }, { commit: true })}
          />
          <ColorField
            label={t("unit.statusReserved")}
            value={draft.unitColorReserved}
            onChange={(v) => update({ unitColorReserved: v }, { commit: true })}
          />
          <ColorField
            label={t("unit.statusSold")}
            value={draft.unitColorSold}
            onChange={(v) => update({ unitColorSold: v }, { commit: true })}
          />
          <ColorField
            label={t("admin.unitStatusColorSelected")}
            value={draft.unitColorSelected}
            onChange={(v) => update({ unitColorSelected: v }, { commit: true })}
          />
        </div>
      </section>

      {/* --- Filters --- */}
      <section className="border-t border-neutral-100 pt-5">
        <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.inventoryFiltersTitle")}
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={showOnlyNeedsReview}
            onClick={() => setShowOnlyNeedsReview((v) => !v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              showOnlyNeedsReview
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            )}
          >
            {t("admin.detailModelShowNeedsReview")}
          </button>
          {selectedFloor && (
            <button
              type="button"
              onClick={() => setSelectedFloor(null)}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50"
            >
              {t("admin.inventoryClearFloorFilter")}
            </button>
          )}
        </div>
        {selectedFloor && (
          <p className="mt-2 text-[11px] text-neutral-400">
            {t("admin.inventoryFloorFilterActive", {
              building: selectedFloor.building,
              floor: t("admin.detailModelFloorLabel", { floor: selectedFloor.floor }),
            })}
          </p>
        )}
      </section>

      {/* --- Floors & Sections — real cut-plane authoring now lives in its
          own top-level Sections tab (modes.ts); this note just points
          there instead of duplicating that UI inside Inventory. --- */}
      <section className="border-t border-neutral-100 pt-5">
        <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.inventoryFloorsSectionsTitle")}
        </h4>
        <p className="rounded-control border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[11px] text-neutral-500">
          {t("admin.inventoryFloorsSectionsNote")}
        </p>
      </section>
    </div>
  );
}
