"use client";

import { Map as MapIcon } from "lucide-react";
import { ProjectMapView, type ProjectMapViewCamera } from "@/components/map/ProjectMapView";
import type { GeoPoint, Project, Project3DConfig } from "@/lib/types";

/**
 * Center viewport for the "Map" tab — swapped in for `EditorViewport`
 * (the WebGPU Studio viewer) whenever that tab is active, never alongside
 * it (see ExperienceEditor.tsx: exactly one of the two is mounted at a
 * time, matching the public viewer's own Studio/Map exclusivity). Mirrors
 * `EditorViewport`'s outer shell sizing so the surrounding layout doesn't
 * shift when switching tabs, but doesn't forward a `ThreeProjectViewerHandle`
 * ref — there's no Three.js viewer here to hand one back, and every
 * existing `viewerRef.current?.X()` call elsewhere in the editor already
 * tolerates a null ref via optional chaining.
 */
export function MapEditorViewport({
  project,
  draft,
  glbUrl,
  onMove,
  onCaptureCamera,
}: {
  project: Project;
  draft: Project3DConfig;
  glbUrl: string | null;
  onMove: (point: GeoPoint) => void;
  onCaptureCamera: (camera: ProjectMapViewCamera) => void;
}) {
  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col bg-neutral-900">
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-1.5">
        <MapIcon className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-[11px] font-medium text-neutral-400">
          Real-world Mapbox preview — drag the marker to reposition
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <ProjectMapView
          project={{ id: project.id, coords: project.coords }}
          glbUrl={glbUrl}
          editable
          onMove={onMove}
          onCaptureCamera={onCaptureCamera}
          placement={{
            latitude: draft.mapViewLatitude,
            longitude: draft.mapViewLongitude,
            altitude: draft.mapViewAltitude,
            headingDeg: draft.mapViewHeadingDeg,
            scale: draft.mapViewScale,
          }}
          camera={{
            zoom: draft.mapViewZoom,
            pitchDeg: draft.mapViewPitchDeg,
            bearingDeg: draft.mapViewBearingDeg,
          }}
          sun={{
            azimuthDeg: draft.sunAzimuthDeg,
            elevationDeg: draft.sunElevationDeg,
            autoIntensityEnabled: draft.autoSunIntensityEnabled,
            autoColorEnabled: draft.autoSunColorEnabled,
            manualIntensity: draft.manualSunIntensity,
            manualColorHex: draft.manualSunColorHex,
            enabled: draft.sunLightEnabled,
          }}
        />
      </div>
    </div>
  );
}
