"use client";

import { Map as MapIcon, X } from "lucide-react";
import { ProjectIdentity } from "./ProjectIdentity";

/**
 * Studio ⇄ Map switch (Experience Editor "Map" tab — see Project3DConfig's
 * own doc comment). Deliberately two small, independent pieces rather than
 * threading a `viewMode` prop through `ViewerHUD`/`ViewerUtilities`: those
 * two already carry a lot of tuned GSAP load-in/dock-morph behavior that's
 * entirely Studio-specific, and Map mode's own chrome needs none of it
 * (no Units/Views/Sun&Time dock, no North Compass tracking a viewport it
 * doesn't apply to) — so it gets its own minimal bar instead of a
 * conditionally-degraded copy of Studio's. `ProjectViewerRuntime.tsx`
 * renders exactly one of these two at a time, matching Studio/Map's own
 * mutual exclusivity ("do not overlay").
 */

/** Small floating pill, shown alongside Studio's own HUD (top-right, below
 * ViewerUtilities' capsule) only when this project actually has a Map view
 * to switch to. */
export function MapViewEntryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-panel-dark pointer-events-auto flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
    >
      <MapIcon className="h-3.5 w-3.5" />
      View on Map
    </button>
  );
}

/** Map mode's own minimal top bar — project identity (same plate Studio's
 * HUD uses) plus a way back. Mirrors ViewerHUD's own header positioning
 * (`absolute inset-x-0 top-0`, same safe-area padding) so switching modes
 * doesn't visibly jump the chrome around. */
export function MapModeBar({
  projectName,
  developerName,
  city,
  onExit,
}: {
  projectName: string;
  developerName: string;
  city: string;
  onExit: () => void;
}) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:p-4">
      <div className="pointer-events-auto min-w-0">
        <ProjectIdentity projectName={projectName} developerName={developerName} city={city} />
      </div>
      <button
        type="button"
        onClick={onExit}
        className="glass-panel-dark pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-pill px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
      >
        <X className="h-3.5 w-3.5" />
        Back to Studio
      </button>
    </header>
  );
}
