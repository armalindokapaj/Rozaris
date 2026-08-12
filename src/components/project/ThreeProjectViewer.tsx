"use client";

import { forwardRef } from "react";
import { ProceduralProjectViewer } from "./ProceduralProjectViewer";
import type { ThreeProjectViewerHandle, ThreeProjectViewerProps } from "./viewerTypes";

export type { ThreeProjectViewerHandle } from "./viewerTypes";

/**
 * Project 3D Experience — as of "3D Experience Phase 1", a thin re-export
 * rather than a dispatcher between two engines. `ProceduralProjectViewer`
 * is now the one real viewer: a standalone WebGPU/WebGL2 canvas ROZARIS
 * fully owns, rendering either the procedural box-massing fallback or an
 * admin-uploaded detailed GLB (via useProjectDetailModel, called inside
 * that component) in the same scene/camera/renderer. The old
 * Mapbox-embedded path (MapboxProjectViewer.tsx -> DetailModelLayer.ts,
 * which rendered a GLB *inside Mapbox's own shared WebGL2 context* — no
 * OrbitControls, no post-processing, no WebGPU possible there) has been
 * retired; see the "3D Experience — Planpoint-style rendering, Phase 1"
 * plan for why. Kept as its own module (not inlined into every caller)
 * since callers (ArchVizClient.tsx, Project3DConfigEditor.tsx) still import
 * `ThreeProjectViewer` by name.
 */
export const ThreeProjectViewer = forwardRef<ThreeProjectViewerHandle, ThreeProjectViewerProps>(
  function ThreeProjectViewer(props, ref) {
    return <ProceduralProjectViewer {...props} ref={ref} />;
  }
);
