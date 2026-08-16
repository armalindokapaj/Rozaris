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
  function ThreeProjectViewer({ detailModels, className, showPerfStats, onPerfStats, cameraConfig, qualityConfig, environmentConfig, lightingConfig, renderingConfig, onReady }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<RenderEngine | null>(null);
    const [webglFailed, setWebglFailed] = useState(false);
    const readyFiredRef = useRef(false);

    useImperativeHandle(ref, () => ({
      resetView: () => engineRef.current?.resetView(),
      captureScreenshot: () => engineRef.current?.captureScreenshot() ?? null,
      computeGroundAlignOffset: (slotId: string) => engineRef.current?.computeGroundAlignOffset(slotId) ?? null,
      getCameraState: () => engineRef.current?.getCameraState() ?? null,
      flyToPreset: (preset) => engineRef.current?.flyToPreset(preset),
      showCameraHelperFor: (preset) => engineRef.current?.showCameraHelperFor(preset),
      activateSection: (section) => engineRef.current?.activateSection(section),
      getContentBounds: () => engineRef.current?.getContentBounds() ?? null,
      getEffectiveRenderScale: () => engineRef.current?.getEffectiveRenderScale() ?? 1,
      setSelectedUnit: (unitId) => engineRef.current?.setSelectedUnit(unitId),
    }));

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const engine = new RenderEngine({
        onWebglFail: () => setWebglFailed(true),
        onPerfStats: (stats) => onPerfStats?.(stats),
      });
      engineRef.current = engine;
      void engine.mount(container, { showPerfStats });
      return () => {
        engine.dispose();
        engineRef.current = null;
      };
      // Deliberately empty — mount() only sets up the renderer/scene/
      // camera once per container; content and perf-stats toggling both
      // go through syncModels()/imperative reads below, not a remount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
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

    return (
      <div ref={containerRef} className={className}>
        {webglFailed && (
          <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-sm text-white/60">
            This device can&apos;t display the 3D viewer.
          </div>
        )}
      </div>
    );
  }
);
