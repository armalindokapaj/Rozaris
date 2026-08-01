"use client";

import { useState } from "react";
import Link from "next/link";
import type mapboxgl from "mapbox-gl";
import { LayoutGrid, RotateCcw, Eye, SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useT } from "@/lib/i18n/useT";
import { ExteriorViewer, resetExteriorView } from "@/components/project/ExteriorViewer";
import { SimplifiedProjectView } from "@/components/project/SimplifiedProjectView";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import { UnitDiscoveryPanel } from "@/components/project/UnitDiscoveryPanel";
import { UnitDetailPanel } from "@/components/project/UnitDetailPanel";
import type { Project, Unit } from "@/lib/types";

export function ArchVizClient({ project }: { project: Project }) {
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [unitPanelOpen, setUnitPanelOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [simplified, setSimplified] = useState(false);
  const compareCount = useAppStore((s) => s.compare.length);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);
  const construction = useProjectConstruction(project);
  const { t } = useT();

  return (
    <div id="main-content" className="relative h-dvh w-full overflow-hidden bg-neutral-900">
      <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="glass-panel-dark flex items-center gap-3 rounded-panel px-3.5 py-2.5 sm:px-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
              R
            </span>
            <span className="hidden sm:inline">ROZARIS</span>
          </Link>
          <span className="h-5 w-px bg-white/20" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{project.name}</p>
            <p className="truncate text-xs text-white/60">{project.developer.name}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {compareCount > 0 && (
            <button
              onClick={() => setCompareOverlayOpen(true)}
              className="glass-panel-dark flex items-center gap-1.5 rounded-control px-3 py-2.5 text-xs font-semibold text-white"
            >
              <SquareStack className="h-3.5 w-3.5" />
              {compareCount}
            </button>
          )}
          <button
            onClick={() => setSimplified((v) => !v)}
            aria-pressed={simplified}
            className="glass-panel-dark flex items-center gap-1.5 rounded-control px-3 py-2.5 text-xs font-semibold text-white"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {simplified ? t("project.threeDView") : t("project.simplifiedView")}
            </span>
          </button>
          {!simplified && (
            <button
              onClick={() => resetExteriorView(map, project)}
              aria-label={t("project.resetExteriorView")}
              className="glass-panel-dark flex h-10 w-10 items-center justify-center rounded-full text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {!simplified ? (
        <ExteriorViewer
          project={project}
          className="relative h-full w-full"
          onMapReady={setMap}
          onExploreUnits={() => setUnitPanelOpen(true)}
        />
      ) : (
        <SimplifiedProjectView project={project} />
      )}

      {!unitPanelOpen && (
        <div className="absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-3 px-4 sm:bottom-6">
          {project.status === "under_construction" && (
            <div className="w-full max-w-sm">
              <ConstructionTimelineStrip
                stages={construction.stages}
                overallPercent={construction.progressPercent}
              />
            </div>
          )}
          <button
            onClick={() => setUnitPanelOpen(true)}
            className="flex items-center gap-2 rounded-pill bg-brand-500 px-6 py-3.5 text-sm font-bold text-white shadow-xl hover:bg-brand-600"
          >
            <LayoutGrid className="h-4 w-4" />
            {t("project.exploreAvailableUnits", { count: project.availableUnits })}
          </button>
        </div>
      )}

      <UnitDiscoveryPanel
        project={project}
        open={unitPanelOpen}
        onClose={() => setUnitPanelOpen(false)}
        onSelectUnit={(u) => setSelectedUnit(u)}
      />
      {selectedUnit && (
        <UnitDetailPanel
          project={project}
          unit={selectedUnit}
          onClose={() => setSelectedUnit(null)}
        />
      )}
    </div>
  );
}
