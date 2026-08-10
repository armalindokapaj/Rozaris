"use client";

import { Bath, BedDouble, Check, Heart, Ruler, SquareStack, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { Project, Unit } from "@/lib/types";

const STATUS_LABEL_KEY: Record<Unit["status"], string> = {
  available: "unit.statusAvailable",
  reserved: "unit.statusReserved",
  sold: "unit.statusSold",
};

/**
 * Small floating card shown when a unit is clicked in the 3D viewer —
 * deliberately not a full-screen modal: no backdrop, so the scene stays
 * interactive and clicking a *different* unit just swaps this card's
 * content in place (ArchVizClient re-points `selectedUnit`, no explicit
 * close needed first). "View Unit" escalates to the full UnitDetailPanel
 * (gallery, publisher contact) for anyone who wants more than this.
 */
export function UnitPreviewCard({
  project,
  unit,
  onClose,
  onViewDetails,
}: {
  project: Project;
  unit: Unit;
  onClose: () => void;
  onViewDetails: () => void;
}) {
  const priceFmt = usePriceFormat();
  const { t } = useT();
  const auth = useAppStore((s) => s.auth);
  const saved = useAppStore((s) => s.saved.projects.includes(project.id));
  const toggleSaved = useAppStore((s) => s.toggleSavedProject);
  const compare = useAppStore((s) => s.compare);
  const addCompare = useAppStore((s) => s.addCompare);
  const removeCompareAt = useAppStore((s) => s.removeCompareAt);
  const compareIndex = compare.findIndex((c) => c.kind === "unit" && c.entity.id === unit.id);
  const inCompare = compareIndex !== -1;

  return (
    <div
      role="dialog"
      aria-label={unit.code}
      // top-32 on mobile clears the under-construction badge that floats
      // centered below the header there (ConstructionTimelineStrip's
      // compact form lives inside the header row itself from sm: up, so
      // this only needs the extra clearance on narrow screens).
      className="absolute right-3 top-32 z-30 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-panel border border-neutral-200 bg-white p-4 shadow-[var(--shadow-3)] sm:right-4 sm:top-24"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {t("unit.floorLabel", { n: unit.floor })} · {unit.code}
          </p>
          <p className="mt-0.5 font-serif text-xl text-neutral-900">{priceFmt(unit.price)}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-3 text-xs text-neutral-500">
        <span className="flex items-center gap-1">
          <BedDouble className="h-3.5 w-3.5" /> {unit.bedrooms}
        </span>
        <span className="flex items-center gap-1">
          <Bath className="h-3.5 w-3.5" /> {unit.bathrooms}
        </span>
        <span className="flex items-center gap-1">
          <Ruler className="h-3.5 w-3.5" /> {unit.area} m²
        </span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
            unit.status === "available" && "bg-green-100 text-green-700",
            unit.status === "reserved" && "bg-amber-100 text-amber-700",
            unit.status === "sold" && "bg-neutral-100 text-neutral-500"
          )}
        >
          {t(STATUS_LABEL_KEY[unit.status])}
        </span>
      </div>

      <div className="mt-3.5 flex items-center gap-2 border-t border-neutral-100 pt-3.5">
        <button
          onClick={() => auth.signedIn && toggleSaved(project.id)}
          disabled={!auth.signedIn}
          aria-label={saved ? t("unit.savedProject") : t("unit.saveProject")}
          aria-pressed={saved}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
        >
          <Heart className={cn("h-4 w-4", saved && "fill-red-500 text-red-500")} />
        </button>
        <button
          onClick={() =>
            inCompare
              ? removeCompareAt(compareIndex)
              : addCompare({ kind: "unit", entity: unit, projectName: project.name, projectSlug: project.slug })
          }
          disabled={unit.status === "sold"}
          aria-label={inCompare ? t("listing.inCompare") : t("nav.compare")}
          aria-pressed={inCompare}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-control disabled:opacity-40",
            inCompare ? "bg-brand-500 text-white" : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          )}
        >
          {inCompare ? <Check className="h-4 w-4" /> : <SquareStack className="h-4 w-4" />}
        </button>
        <button
          onClick={onViewDetails}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-control bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          {t("results.viewUnit")}
        </button>
      </div>
    </div>
  );
}
