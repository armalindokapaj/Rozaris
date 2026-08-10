"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, HelpCircle, LayoutGrid, Share2, SquareStack } from "lucide-react";
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
  // The viewer's own filter bar is open by default and can be several rows
  // tall on narrow screens — hide the "explore units" CTA below while it's
  // showing instead of guessing a bottom offset that would overlap it.
  const [unitBarOpen, setUnitBarOpen] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const compareCount = useAppStore((s) => s.compare.length);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);
  const construction = useProjectConstruction(project);
  const viewerConfig = useProject3DConfig(project.id);
  const { t } = useT();

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: project.name, url });
        return;
      } catch {
        // User cancelled the native sheet, or it's unsupported for this
        // context — fall through to the clipboard copy below either way.
      }
    }
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  }

  function handleScreenshot() {
    const dataUrl = viewerRef.current?.captureScreenshot();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${project.slug}-rozaris.png`;
    a.click();
  }

  return (
    <div id="main-content" className="relative h-dvh w-full overflow-hidden bg-neutral-900">
      <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="glass-panel-dark flex items-center gap-3 rounded-panel px-3.5 py-2.5 sm:px-4">
          <Link href="/search" className="hidden shrink-0 font-serif text-sm tracking-[0.14em] text-white sm:block">
            ROZARIS
          </Link>
          <span className="hidden h-5 w-px bg-white/20 sm:block" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{project.name}</p>
            <p className="truncate text-xs text-white/60">
              {project.developer.name} · {project.city}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {compareCount > 0 && (
            <button
              onClick={() => setCompareOverlayOpen(true)}
              className="glass-panel-dark flex items-center gap-1.5 rounded-pill px-3 py-2.5 text-xs font-semibold text-white"
            >
              <SquareStack className="h-3.5 w-3.5" />
              {compareCount}
            </button>
          )}
          <Link
            href="/help"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-panel-dark hidden items-center gap-1.5 rounded-pill px-3.5 py-2.5 text-xs font-semibold text-white sm:flex"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {t("project.help")}
          </Link>
          <button
            onClick={handleShare}
            className="glass-panel-dark flex items-center gap-1.5 rounded-pill px-3.5 py-2.5 text-xs font-semibold text-white"
          >
            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{t("project.share")}</span>
          </button>
          <button
            onClick={handleScreenshot}
            className="glass-panel-dark flex items-center gap-1.5 rounded-pill px-3.5 py-2.5 text-xs font-semibold text-white"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("project.screenshot")}</span>
          </button>
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
        onBarOpenChange={setUnitBarOpen}
      />

      {!unitPanelOpen && !unitBarOpen && (
        // bottom-16, not the usual bottom-5/6: the viewer's own "reopen
        // filter bar" pill (ThreeProjectViewer.tsx) is anchored at the same
        // bottom-center spot and only shows in this exact same state (bar
        // collapsed) — this clears it instead of stacking on top of it.
        <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-3 px-4">
          <button
            onClick={() => setUnitPanelOpen(true)}
            className="flex items-center gap-2 rounded-pill bg-brand-500 px-6 py-3.5 text-sm font-bold text-white shadow-[var(--shadow-1)] hover:bg-brand-600"
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
