"use client";

import { forwardRef, useRef, useState } from "react";
import { Expand, Minimize, Move, MousePointer2, RotateCw, Scale as ScaleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThreeProjectViewer } from "@/components/project/ThreeProjectViewer";
import type { ThreeProjectViewerHandle, ThreeProjectViewerProps } from "@/components/project/viewerTypes";
import type { CameraConfig, DetailModelEntry, ModelLoadStatus, QualityConfig } from "@/lib/render-engine/RenderEngine";
import type { EnvironmentConfig, LightingConfig, RenderingConfig, SiteRuntimeConfig, UnitsConfig } from "@/lib/types";

type Tool = "select" | "move" | "rotate" | "scale";

const TOOLS: { id: Tool; icon: typeof MousePointer2; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "move", icon: Move, label: "Move" },
  { id: "rotate", icon: RotateCw, label: "Rotate" },
  { id: "scale", icon: ScaleIcon, label: "Scale" },
];

export const EditorViewport = forwardRef<
  ThreeProjectViewerHandle,
  {
    detailModels: DetailModelEntry[];
    slotsLoaded: boolean;
    cameraConfig?: CameraConfig;
    qualityConfig?: QualityConfig;
    environmentConfig?: EnvironmentConfig;
    lightingConfig?: LightingConfig;
    renderingConfig?: RenderingConfig;
    unitsConfig?: UnitsConfig;
    siteConfig?: SiteRuntimeConfig;
    onSiteStatus?: ThreeProjectViewerProps["onSiteStatus"];
    onUnitClick?: (unitId: string | null) => void;
    onUnitHover?: (unitId: string | null) => void;
    onPerfStats?: (
      stats: { fps: number; frameTimeMs: number; drawCalls: number; triangles: number; textures: number; dpr: number } | null
    ) => void;
  }
>(function EditorViewport(
  { detailModels, slotsLoaded, cameraConfig, qualityConfig, environmentConfig, lightingConfig, renderingConfig, unitsConfig, siteConfig, onUnitClick, onUnitHover, onPerfStats, onSiteStatus },
  viewerRef
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [tool, setTool] = useState<Tool>("select");
    const [fullscreen, setFullscreen] = useState(false);
    const [modelLoadStatus, setModelLoadStatus] = useState<ModelLoadStatus>({ state: "loading" });

    function toggleFullscreen() {
      const el = containerRef.current;
      if (!el) return;
      if (!document.fullscreenElement) {
        void el.requestFullscreen?.().then(() => setFullscreen(true));
      } else {
        void document.exitFullscreen?.().then(() => setFullscreen(false));
      }
    }

    return (
      <div ref={containerRef} className="relative flex h-full min-w-0 flex-1 flex-col bg-neutral-900">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-1.5">
          <div className="flex items-center gap-1 rounded-md bg-neutral-900 p-0.5">
            {TOOLS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={label}
                className={cn(
                  "rounded p-1.5",
                  tool === id ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-100"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] text-neutral-400">Perspective</span>
            <span className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] text-neutral-400">Lit</span>
            <button
              onClick={toggleFullscreen}
              title="Fullscreen"
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-900 hover:text-white"
            >
              {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          <ThreeProjectViewer
            ref={viewerRef}
            detailModels={detailModels}
            cameraConfig={cameraConfig}
            qualityConfig={qualityConfig}
            environmentConfig={environmentConfig}
            lightingConfig={lightingConfig}
            renderingConfig={renderingConfig}
            unitsConfig={unitsConfig}
            siteConfig={siteConfig}
            onSiteStatus={onSiteStatus}
            onUnitClick={onUnitClick}
            onUnitHover={onUnitHover}
            className="relative h-full w-full"
            showPerfStats={!!onPerfStats}
            onPerfStats={onPerfStats}
            onModelLoadStatus={setModelLoadStatus}
          />
          {slotsLoaded && modelLoadStatus.state === "loading" && (
            <div role="status" className="pointer-events-none absolute left-3 top-3 rounded-md bg-neutral-900/90 px-3 py-2 text-xs text-neutral-300">
              Loading 3D models…
            </div>
          )}
          {modelLoadStatus.state === "failed" && (
            <div role="alert" className="absolute inset-x-3 top-3 rounded-md border border-red-400/30 bg-neutral-900/95 p-3 text-sm text-white">
              <p className="font-semibold">Could not load 3D models</p>
              <p className="mt-1 text-xs text-neutral-300">
                {modelLoadStatus.forbidden
                  ? "Model storage denied access (403). Restore access to the Blob store, then reload."
                  : "Check the model files and your connection, then reload."}
              </p>
              <p className="mt-1 text-xs text-neutral-400">{modelLoadStatus.models.join(", ")}</p>
              <button type="button" onClick={() => window.location.reload()} className="mt-2 rounded border border-white/20 px-3 py-1 text-xs hover:bg-white/10">
                Reload
              </button>
            </div>
          )}
          {!slotsLoaded && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-900">
              <div className="flex flex-col items-center gap-3 text-neutral-400">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
                <span className="text-xs font-medium">Loading 3D scene…</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
