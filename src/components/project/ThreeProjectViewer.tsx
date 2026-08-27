"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { RenderEngine } from "@/lib/render-engine/RenderEngine";
import type { ThreeProjectViewerHandle, ThreeProjectViewerProps } from "./viewerTypes";

export type { ThreeProjectViewerHandle, ThreeProjectViewerProps } from "./viewerTypes";

/**
 * Public/admin-shared 3D viewport — ground-up rebuild (2026-08-15,
 * Experience Editor v2). A thin React wrapper around RenderEngine.ts.
 *
 * Renderer/scene/camera mount ONCE per container (empty-deps effect); a
 * separate effect calls engine.syncModels() whenever `detailModels`
 * changes, which is the cheap add/update/remove path — see
 * RenderEngine.syncModels's own doc comment for why this split matters
 * (a naive dispose+remount on every prop change would reload the GLB from
 * network on every Inspector slider tick).
 */
export const ThreeProjectViewer = forwardRef<ThreeProjectViewerHandle, ThreeProjectViewerProps>(
  function ThreeProjectViewer(
    { detailModels, className, showPerfStats, onPerfStats, cameraConfig, qualityConfig, environmentConfig, lightingConfig, renderingConfig, unitsConfig, siteConfig, onUnitClick, onUnitHover, onReady, onSiteStatus, onRendererFacts, onContextLost },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<RenderEngine | null>(null);
    const [webglFailed, setWebglFailed] = useState(false);
    /** A context lost AFTER a successful start — see
     * `RenderEngine.watchForContextLoss`. Kept separate from
     * `webglFailed` because the two need different words: one device
     * cannot run the viewer at all, the other was running it and the GPU
     * took the canvas away (iOS Safari does this under memory pressure).
     * Until this existed the second case rendered a black rectangle and
     * said nothing, which is exactly how it gets reported as "it's
     * dark". */
    const [contextLost, setContextLost] = useState(false);
    const readyFiredRef = useRef(false);
    // Callback props change identity every render in most callers (inline
    // arrow functions) — read through a ref inside the mount-time engine
    // construction instead of depending on them directly, same reasoning
    // the mount effect below already documents for why it stays empty-deps.
    const onUnitClickRef = useRef(onUnitClick);
    onUnitClickRef.current = onUnitClick;
    const onUnitHoverRef = useRef(onUnitHover);
    const onSiteStatusRef = useRef(onSiteStatus);
    const onRendererFactsRef = useRef(onRendererFacts);
    const onContextLostRef = useRef(onContextLost);
    onRendererFactsRef.current = onRendererFacts;
    onContextLostRef.current = onContextLost;
    onUnitHoverRef.current = onUnitHover;
    onSiteStatusRef.current = onSiteStatus;
    // Multi-Channel Publishing PRD Phase 5 fix (2026-08-18) — read through
    // a ref for the same reason the two above are, but for a real bug
    // this one exists to fix: see the mount effect's own doc comment.
    const detailModelsRef = useRef(detailModels);
    detailModelsRef.current = detailModels;
    // Guards the syncModels effect below against re-doing the FIRST sync
    // a second time — the mount effect now owns that once `mount()`
    // actually resolves (see its own comment). `true` initially and
    // flipped exactly once, on this component's first-ever effect pass.
    const isFirstSyncRef = useRef(true);

    useImperativeHandle(ref, () => ({
      resetView: () => engineRef.current?.resetView(),
      captureScreenshot: () => engineRef.current?.captureScreenshot() ?? Promise.resolve(null),
      computeGroundAlignOffset: (slotId: string) => engineRef.current?.computeGroundAlignOffset(slotId) ?? null,
      getCameraState: () => engineRef.current?.getCameraState() ?? null,
      flyToPreset: (preset) => engineRef.current?.flyToPreset(preset),
      showCameraHelperFor: (preset) => engineRef.current?.showCameraHelperFor(preset),
      activateSection: (section, options) => engineRef.current?.activateSection(section, options),
      getContentBounds: () => engineRef.current?.getContentBounds() ?? null,
      getEffectiveRenderScale: () => engineRef.current?.getEffectiveRenderScale() ?? 1,
      setSelectedUnit: (unitId) => engineRef.current?.setSelectedUnit(unitId),
      setUnitsMode: (enabled) => engineRef.current?.setUnitsMode(enabled),
      setUnitStatusFilters: (filters) => engineRef.current?.setUnitStatusFilters(filters),
      setUnitIdFilter: (unitIds) => engineRef.current?.setUnitIdFilter(unitIds),
      isolateUnit: (unitId) => engineRef.current?.isolateUnit(unitId),
      hoverUnit: (unitId) => engineRef.current?.hoverUnit(unitId),
      focusUnit: (unitId) => engineRef.current?.focusUnit(unitId) ?? false,
      getUnitViewportState: (unitId) => engineRef.current?.getUnitViewportState(unitId) ?? null,
      revealUnit: (unitId, screenBiasY) => engineRef.current?.revealUnit(unitId, screenBiasY) ?? false,
      revealUnits: (unitIds, screenBiasY, frameFraction) =>
        engineRef.current?.revealUnits(unitIds, screenBiasY, frameFraction) ?? false,
      revealArea: (area, screenBiasY, frameFraction) =>
        engineRef.current?.revealArea(area, screenBiasY, frameFraction) ?? false,
      resetUnitCamera: () => engineRef.current?.resetUnitCamera(),
      getUnitRegistrySnapshot: () => engineRef.current?.getUnitRegistrySnapshot() ?? [],
      resetIdleTimer: () => engineRef.current?.resetIdleTimer(),
      isIdleDroneActive: () => engineRef.current?.isIdleDroneActive() ?? false,
      setIdleDroneSuspended: (suspended) => engineRef.current?.setIdleDroneSuspended(suspended),
      previewIdleDrone: () => engineRef.current?.startIdleDronePreview(),
      stopIdleDronePreview: () => engineRef.current?.stopIdleDronePreview(),
      setShowDronePath: (enabled) => engineRef.current?.setShowDronePath(enabled),
    }));

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      let cancelled = false;
      const engine = new RenderEngine({
        onWebglFail: () => setWebglFailed(true),
        onContextLost: () => {
          setContextLost(true);
          onContextLostRef.current?.();
        },
        onRendererFacts: (facts) => onRendererFactsRef.current?.(facts),
        onPerfStats: (stats) => onPerfStats?.(stats),
        onUnitClick: (unitId) => onUnitClickRef.current?.(unitId),
        onUnitHover: (unitId) => onUnitHoverRef.current?.(unitId),
        // Read through a ref for the same reason onUnitClick/onUnitHover
        // are: callers pass an inline arrow, so a direct capture here
        // would freeze the very first render's closure for the life of
        // the engine.
        onSiteStatus: (status) => onSiteStatusRef.current?.(status),
      });
      engineRef.current = engine;
      // Real bug fix (Multi-Channel Publishing PRD Phase 5, 2026-08-18,
      // found while investigating why `/embed/[publicKey]` never rendered
      // its building): `engine.mount()` sets up scene/loader/
      // clippingGroup ASYNCHRONOUSLY, and RenderEngine.syncModels()
      // silently no-ops (`if (!scene || !loader || !clippingGroup)
      // return;`) if called before that finishes — no error, no retry,
      // nothing. The syncModels effect below used to fire in the exact
      // same commit as this one, calling `engine.syncModels(detailModels)`
      // before `mount()` had any chance to complete, every single time.
      // MarketplaceViewer never noticed: `useProjectDetailModel` always
      // starts with `[]`, so that premature, no-op'd first call cost
      // nothing, and the real load only ever happened on a SECOND,
      // later call once the live fetch resolved — by which point mount()
      // was long done. WhiteLabelViewer broke that assumption: it only
      // renders `ThreeProjectViewer` once its own bootstrap fetch is
      // already complete, so its FIRST-ever `detailModels` is already
      // real content — meaning its GLB silently never loaded, ever,
      // with zero error anywhere to point at. Fix: explicitly wait for
      // `mount()` to resolve before the first real `syncModels()` call,
      // instead of firing it in the same tick and hoping the timing
      // works out. `detailModelsRef` (not the `detailModels` this
      // empty-deps effect closed over at mount time) so this syncs
      // whatever the latest value actually is by the time mount finishes,
      // not a stale snapshot from before any data had loaded.
      void engine.mount(container, { showPerfStats }).then(() => {
        if (cancelled) return;
        void engine.syncModels(detailModelsRef.current).then(() => {
          if (readyFiredRef.current) return;
          readyFiredRef.current = true;
          onReady?.();
        });
      });
      return () => {
        cancelled = true;
        engine.dispose();
        engineRef.current = null;
      };
      // Deliberately empty — mount() only sets up the renderer/scene/
      // camera once per container; content and perf-stats toggling both
      // go through syncModels()/imperative reads below, not a remount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      // The very first sync is now owned by the mount effect above, run
      // once `mount()` actually resolves rather than racing it — see that
      // effect's own doc comment for the real bug this fixes. Both
      // effects fire in the same commit on initial mount (React runs
      // effects in declaration order within one commit), so
      // `isFirstSyncRef.current` is still `true` here at that point — the
      // mount effect's own `.then()` callback hasn't run yet, it's
      // scheduled for a later microtask/macrotask. This effect only needs
      // to react to real CHANGES from here on (a Replace, a POI edit, a
      // live inventory poll producing a fresh `detailModels` reference on
      // the white-label path, etc.).
      if (isFirstSyncRef.current) {
        isFirstSyncRef.current = false;
        return;
      }
      void engineRef.current?.syncModels(detailModels).then(() => {
        if (readyFiredRef.current) return;
        readyFiredRef.current = true;
        onReady?.();
      });
      // onReady deliberately excluded — see its doc comment in
      // viewerTypes.ts. Only `detailModels` should re-trigger this.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailModels]);

    useEffect(() => {
      engineRef.current?.setPerfStatsEnabled(!!showPerfStats);
    }, [showPerfStats]);

    useEffect(() => {
      if (cameraConfig) engineRef.current?.setCameraConfig(cameraConfig);
    }, [cameraConfig]);

    useEffect(() => {
      if (qualityConfig) engineRef.current?.setQualityConfig(qualityConfig);
    }, [qualityConfig]);

    useEffect(() => {
      if (environmentConfig) engineRef.current?.setEnvironmentConfig(environmentConfig);
    }, [environmentConfig]);

    useEffect(() => {
      if (lightingConfig) engineRef.current?.setLightingConfig(lightingConfig);
    }, [lightingConfig]);

    useEffect(() => {
      if (renderingConfig) engineRef.current?.setRenderingConfig(renderingConfig);
    }, [renderingConfig]);

    useEffect(() => {
      if (unitsConfig) engineRef.current?.setUnitsConfig(unitsConfig);
    }, [unitsConfig]);

    // "Map" tab — real-world site context. Same prop-identity pattern as
    // every other config effect above: the caller useMemo's this object
    // over the config draft, so an alignment drag re-enters setSiteConfig
    // (a matrix write) without ever remounting the engine or refetching a
    // tile. Deliberately not a mount param — the abandoned Mapbox-owns-
    // the-canvas design had to be one, which is precisely why toggling it
    // would have torn down and re-downloaded the whole scene.
    useEffect(() => {
      if (siteConfig) engineRef.current?.setSiteConfig(siteConfig);
    }, [siteConfig]);

    return (
      <div ref={containerRef} className={className}>
        {webglFailed && (
          <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-sm text-white/60">
            This device can&apos;t display the 3D viewer.
          </div>
        )}
        {contextLost && !webglFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/95 p-6 text-center text-sm text-white/70">
            <p>The 3D view was interrupted by this device&apos;s graphics driver.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-control border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
            >
              Reload
            </button>
          </div>
        )}
      </div>
    );
  }
);
