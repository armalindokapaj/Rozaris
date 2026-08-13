"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Unit } from "@/lib/types";
import { groupUnitsByFloor } from "@/lib/units";
import type { FloorFilter, Translate } from "./editorTypes";

/**
 * Left rail — building/floor navigation only (Inventory/Floors mockup
 * pass, 2026-08-13; replaces the prior pass's Scene Explorer + Units left
 * panel, both moved to the right-hand tabs — see EditorShell.tsx's layout
 * comment). Groups real `Unit.buildingName`/`Unit.floor`
 * (`prisma/schema.prisma`'s `Unit` model) — not mock data. Deliberately
 * does NOT reproduce the mockup's Section-mode toolbar/Section Settings —
 * see UnitsPanel.tsx's "Floors & Sections" placeholder for why (real
 * cut-plane rendering is a separate, not-yet-built PRD). Selecting a floor
 * here just sets `selectedFloor`, threaded down to the Inventory tab for
 * real filtering — the seam a future Floors & Sections PRD would extend.
 */
export function BuildingNavRail({
  units,
  selectedFloor,
  setSelectedFloor,
  t,
}: {
  units: Unit[];
  selectedFloor: FloorFilter | null;
  setSelectedFloor: (v: FloorFilter | null) => void;
  t: Translate;
}) {
  // `groupUnitsByFloor` (src/lib/units.ts) is the one shared grouping —
  // also used by the Sections module's floor-assignment dropdown and
  // UnitsPanel's floor filter, so all three agree on floor identity.
  const buildings = useMemo(() => groupUnitsByFloor(units), [units]);

  // Default: every building expanded — matches the reference mockup's one
  // (already-open) building; collapsing is just a local convenience for
  // projects with several buildings, not persisted.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
        {t("admin.buildingNavTitle")}
      </h4>
      {buildings.length === 0 ? (
        <p className="text-xs text-neutral-400">{t("admin.buildingNavNoUnits")}</p>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSelectedFloor(null)}
            className={cn(
              "block w-full rounded-control px-2.5 py-1.5 text-left text-xs font-semibold",
              selectedFloor === null ? "bg-brand-50 text-brand-700" : "text-neutral-600 hover:bg-neutral-100"
            )}
          >
            {t("admin.buildingNavAllUnits")}
          </button>
          {buildings.map((b) => {
            const isCollapsed = collapsed.has(b.name);
            return (
              <div key={b.name}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((s) => {
                      const next = new Set(s);
                      if (next.has(b.name)) next.delete(b.name);
                      else next.add(b.name);
                      return next;
                    })
                  }
                  className="flex w-full items-center justify-between px-2.5 py-1 text-xs font-bold text-neutral-800"
                >
                  <span className="truncate">{b.name}</span>
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isCollapsed && "-rotate-90")}
                  />
                </button>
                {!isCollapsed && (
                  <div className="mt-1 space-y-0.5">
                    {b.floors.map(({ floor }) => {
                      const isActive = selectedFloor?.building === b.name && selectedFloor?.floor === floor;
                      return (
                        <button
                          key={floor}
                          type="button"
                          onClick={() => setSelectedFloor({ building: b.name, floor })}
                          className={cn(
                            "block w-full rounded-control px-2.5 py-1.5 text-left text-xs font-medium",
                            isActive ? "bg-brand-500 text-white" : "text-neutral-600 hover:bg-neutral-100"
                          )}
                        >
                          {t("admin.detailModelFloorLabel", { floor })}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
