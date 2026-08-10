"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { LayoutGrid, SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useProject3DConfig } from "@/hooks/useProject3DConfig";
import { useT } from "@/lib/i18n/useT";
import { ThreeProjectViewer, type ThreeProjectViewerHandle } from "@/components/project/ThreeProjectViewer";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import { UnitDiscoveryPanel } from "@/components/project/UnitDiscoveryPanel";
import { UnitDetailPanel } from "@/components/project/UnitDetailPanel";
import type { Project, Unit } from "@/lib/types";

export function ArchVizClient({ project }: { project: Project }) {
  const viewerRef = useRef<ThreeProjectViewerHandle>(null);
  const [unitPanelOpen, setUnitPanelOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const compareCount = useAppStore((s) => s.compare.length);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);
  const construction = useProjectConstruction(project);
  const viewerConfig = useProject3DConfig(project.id);
  const { t } = useT();

  return (
    <div id="main-content" className="relative h-dvh w-full overflow-hidden bg-neutral-900">
      <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="glass-panel-dark flex items-center gap-3 rounded-panel px-3.5 py-2.5 sm:px-4">
          <Link href="/search" className="flex items-center gap-2 text-sm font-bold text-white">
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
        </div>
      </header>

      {!unitPanelOpen && project.status === "under_construction" && (
        <div className="absolute right-3 top-20 z-20 w-[min(90vw,20rem)] sm:right-4 sm:top-24">
          <ConstructionTimelineStrip
            stages={construction.stages}
            overallPercent={construction.progressPercent}
          />
        </div>
      )}

      <ThreeProjectViewer
        ref={viewerRef}
        project={project}
        config={viewerConfig}
        className="relative h-full w-full"
        selectedUnitId={selectedUnit?.id ?? null}
        onSelectUnit={(u) => setSelectedUnit(u)}
        constructionProgressPercent={construction.progressPercent}
      />

      {!unitPanelOpen && (
        <div className="absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-3 px-4 sm:bottom-6">
          <button
            onClick={() => setUnitPanelOpen(true)}
            className="flex items-center gap-2 rounded-pill bg-brand-500 px-6 py-3.5 text-sm font-bold text-white shadow-[0_2px_8px_rgba(17,17,24,0.06)] hover:bg-brand-600"
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
