"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, Expand, Minimize, ScanEye, SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useProject3DConfig } from "@/hooks/useProject3DConfig";
import { useProjectDetailModel } from "@/hooks/useProjectDetailModel";
import { useT } from "@/lib/i18n/useT";
import { ThreeProjectViewer, type ThreeProjectViewerHandle } from "@/components/project/ThreeProjectViewer";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import { UnitDiscoveryPanel } from "@/components/project/UnitDiscoveryPanel";
import { UnitDetailPanel } from "@/components/project/UnitDetailPanel";
import { UnitPreviewCard } from "@/components/project/UnitPreviewCard";
import type { Project, Unit } from "@/lib/types";

export function ArchVizClient({ project }: { project: Project }) {
  const mainRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeProjectViewerHandle>(null);
  const [unitPanelOpen, setUnitPanelOpen] = useState(false);
  // Whether the viewer's own bottom panel (Unit Search) is expanded —
  // used to declutter the header's construction-progress pill while one
  // is open, not to gate a CTA anymore (that button is gone).
  const [viewerPanelOpen, setViewerPanelOpen] = useState(false);
  // Availability/unit-box colors/legend and the popup below are only
  // meant to be visible while "Unit Search" is the active bottom-menu
  // panel — clicking Home (or just closing Unit Search) clears the
  // selection along with them, rather than leaving a stale popup up for a
  // unit no longer visibly selectable in the scene.
  const [unitSearchActive, setUnitSearchActive] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  // The 3D click flow always lands on the small UnitPreviewCard first;
  // this only flips true when that card's own "View Unit" button asks for
  // the full gallery/publisher-contact panel.
  const [fullDetailOpen, setFullDetailOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  // Shadow-map debug HUD (webgl_shadowmap_viewer.html parity) — a real
  // dev/debug tool, not something a real visitor should stumble onto, so
  // the toggle button itself only renders behind a `?debugShadowMap=1`
  // query param rather than always being in the header chrome (see
  // RenderEngine.ts's shadowMapViewer field doc comment for the full
  // scoping rationale).
  const searchParams = useSearchParams();
  const shadowMapDebugAvailable = searchParams.get("debugShadowMap") === "1";
  const [shadowMapViewerOn, setShadowMapViewerOn] = useState(false);
  const compareCount = useAppStore((s) => s.compare.length);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);
  const construction = useProjectConstruction(project);
  const viewerConfig = useProject3DConfig(project.id);
  const detailModels = useProjectDetailModel(project.id);
  const { t } = useT();

  // Fullscreen targets this whole page wrapper — not ThreeProjectViewer's
  // own canvas container — specifically so the header (ROZARIS/project
  // name/Full Screen/Screenshot) and the viewer's own bottom icon menu all
  // stay visible in real browser fullscreen instead of disappearing along
  // with the rest of the page chrome.
  function toggleFullscreen() {
    const el = mainRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  useEffect(() => {
    function onChange() {
      setFullscreen(document.fullscreenElement === mainRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function handleScreenshot() {
    const dataUrl = viewerRef.current?.captureScreenshot();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${project.slug}-rozaris.png`;
    a.click();
    // Publish/runtime hardening pass — project.screenshotSaved was
    // already translated in both locales but had zero call sites
    // anywhere in the app; same timeout-flash pattern already used for
    // Project3DConfigEditor.tsx's own savedFlash.
    setScreenshotFlash(true);
    setTimeout(() => setScreenshotFlash(false), 2500);
  }

  return (
    <div id="main-content" ref={mainRef} className="relative h-dvh w-full overflow-hidden bg-neutral-900">
      <header className="absolute inset-x-0 top-0 z-30 flex items-stretch justify-between gap-2 p-3 sm:p-4">
        <div className="flex min-w-0 items-stretch gap-2">
          <div className="glass-panel-dark flex min-w-0 items-center gap-3 rounded-panel px-3.5 py-2.5 sm:px-4">
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
          <button
            onClick={toggleFullscreen}
            aria-label={t("unit.viewerFullscreen")}
            className="glass-panel-dark flex shrink-0 items-center justify-center rounded-panel px-3.5 text-white sm:px-4"
          >
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </button>
          <button
            onClick={handleScreenshot}
            aria-label={t("project.screenshot")}
            className="glass-panel-dark flex shrink-0 items-center justify-center rounded-panel px-3.5 text-white sm:px-4"
          >
            <Camera className="h-4 w-4" />
          </button>
          {/* Shadow-map debug HUD (webgl_shadowmap_viewer.html parity) —
              hidden unless ?debugShadowMap=1 is in the URL, see the
              shadowMapDebugAvailable state's own comment above. */}
          {shadowMapDebugAvailable && (
            <button
              onClick={() => setShadowMapViewerOn((v) => !v)}
              aria-label="Toggle shadow map debug view"
              className={`glass-panel-dark flex shrink-0 items-center justify-center rounded-panel px-3.5 text-white sm:px-4 ${shadowMapViewerOn ? "ring-2 ring-white/60" : ""}`}
            >
              <ScanEye className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-stretch gap-2">
          {compareCount > 0 && (
            <button
              onClick={() => setCompareOverlayOpen(true)}
              className="glass-panel-dark flex items-center gap-1.5 rounded-pill px-3.5 text-xs font-semibold text-white"
            >
              <SquareStack className="h-3.5 w-3.5" />
              {compareCount}
            </button>
          )}
          {!unitPanelOpen && !viewerPanelOpen && project.status === "under_construction" && (
            <div className="flex items-stretch">
              <ConstructionTimelineStrip
                stages={construction.stages}
                overallPercent={construction.progressPercent}
                compact
              />
            </div>
          )}
        </div>
      </header>

      {screenshotFlash && (
        <div className="glass-panel-dark pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-pill px-4 py-2 text-xs font-semibold text-white sm:top-20">
          {t("project.screenshotSaved")}
        </div>
      )}

      <ThreeProjectViewer
        ref={viewerRef}
        project={project}
        config={viewerConfig}
        detailModels={detailModels}
        className="relative h-full w-full"
        selectedUnitId={selectedUnit?.id ?? null}
        onSelectUnit={(u) => {
          // Always land back on the small preview card, even if a
          // different unit's full detail panel happened to be open.
          setSelectedUnit(u);
          setFullDetailOpen(false);
        }}
        onBarOpenChange={setViewerPanelOpen}
        onUnitSearchActiveChange={(active) => {
          setUnitSearchActive(active);
          if (!active) {
            setSelectedUnit(null);
            setFullDetailOpen(false);
          }
        }}
        showShadowMapViewer={shadowMapViewerOn}
      />

      <UnitDiscoveryPanel
        project={project}
        open={unitPanelOpen}
        onClose={() => setUnitPanelOpen(false)}
        onSelectUnit={(u) => {
          setSelectedUnit(u);
          setFullDetailOpen(false);
        }}
      />
      {/* Interaction toggle (full-configurator pass) — "Show unit
          information" independently gates the info card/panel even when a
          unit is still selectable/highlightable in the 3D scene; missing
          key (pre-existing config rows) defaults to `true`, same pattern
          as the other viewerUI toggles. */}
      {selectedUnit && !fullDetailOpen && unitSearchActive && (viewerConfig.viewerUI.showUnitInfo ?? true) && (
        <UnitPreviewCard
          project={project}
          unit={selectedUnit}
          onClose={() => setSelectedUnit(null)}
          onViewDetails={() => setFullDetailOpen(true)}
        />
      )}
      {selectedUnit && fullDetailOpen && unitSearchActive && (viewerConfig.viewerUI.showUnitInfo ?? true) && (
        <UnitDetailPanel
          project={project}
          unit={selectedUnit}
          onClose={() => setFullDetailOpen(false)}
        />
      )}
    </div>
  );
}
