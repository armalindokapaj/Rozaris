"use client";

import { cn } from "@/lib/utils";
import { autoMatchUnitNodes } from "@/lib/glbUnitNodes";
import type { Project3DConfig, Unit } from "@/lib/types";
import { ColorField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";

/**
 * Units mode panel — moved verbatim from Project3DConfigEditor.tsx's
 * "Link Units" section (1256-1358). Only rendered once a detail model
 * exists (same gating as the original). Status Colors section added
 * alongside the full-configurator pass — previously hardcoded
 * UNIT_BOX_COLOR/SELECTED_COLOR constants (viewerPresets.ts), now real
 * per-project Project3DConfig fields (RenderEngine.ts's resolveUnitColors,
 * ProceduralProjectViewer.tsx's matching legend/filter-dot derivation).
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
  t: Translate;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.unitStatusColorsTitle")}
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
      <div>
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
        </div>
      )}

      {nodesLoading && <p className="text-xs text-neutral-400">{t("admin.detailModelDetecting")}</p>}
      {!nodesLoading && detectedNodes && detectedNodes.length === 0 && (
        <p className="text-xs text-neutral-400">{t("admin.detailModelNoNodes")}</p>
      )}
      {!nodesLoading && detectedNodes && detectedNodes.length > 0 && (
        <div className="space-y-2">
          {visibleNodes.map((meshName) => (
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
      </div>
    </div>
  );
}
