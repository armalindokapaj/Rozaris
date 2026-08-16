"use client";

import { useEffect, useRef } from "react";
import { Navigation } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import type { ThreeProjectViewerHandle } from "../viewerTypes";

/**
 * Front Page PRD §10 — top-left North / compass control. Purely a
 * read-out: rotates the needle so it keeps pointing at true world north
 * as the visitor orbits, independent of React's render cycle (direct
 * `style.transform` writes in a rAF loop, no state/re-render per frame —
 * PRD §27 wants UI animation to never compete with 3D rendering
 * performance).
 *
 * `northOffsetDeg` is the admin-configured world-space bearing of true
 * north (Environment tab, `Project3DConfig.northOffsetDeg`) — without it
 * the needle would only reflect raw camera spin, not the project's real
 * orientation. Sign convention (needle rotates opposite the camera's
 * orbit so it keeps pointing the same screen-direction as true north):
 * verified by orbiting in a real headed browser; flip the subtraction
 * order here if a future model/scene convention ever disagrees.
 *
 * Click is a real button (44px target, focusable, labelled) but
 * deliberately a no-op for now — PRD §10 defers the reset-north
 * interaction itself to a separate spec ("The detailed interaction will
 * be defined separately"), same honest not-wired-yet pattern the rest of
 * this codebase already uses for future-facing toggles.
 */
export function NorthCompass({
  viewerRef,
  northOffsetDeg = 0,
}: {
  viewerRef: React.RefObject<ThreeProjectViewerHandle | null>;
  northOffsetDeg?: number;
}) {
  const needleRef = useRef<SVGSVGElement>(null);
  const { t } = useT();

  useEffect(() => {
    let raf = 0;
    function tick() {
      raf = requestAnimationFrame(tick);
      const state = viewerRef.current?.getCameraState();
      const needle = needleRef.current;
      if (!state || !needle) return;
      const dx = state.position.x - state.target.x;
      const dz = state.position.z - state.target.z;
      const cameraAzimuthRad = Math.atan2(dx, dz);
      const northOffsetRad = (northOffsetDeg * Math.PI) / 180;
      const needleDeg = ((northOffsetRad - cameraAzimuthRad) * 180) / Math.PI;
      needle.style.transform = `rotate(${needleDeg}deg)`;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewerRef, northOffsetDeg]);

  return (
    <button
      type="button"
      title={t("project.northSign")}
      aria-label={t("project.northSign")}
      className="viewer-glass flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-panel text-white"
    >
      <span className="text-[9px] font-semibold leading-none tracking-wide text-white/70">N</span>
      <Navigation
        ref={needleRef}
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-white"
        style={{ transformOrigin: "50% 50%" }}
      />
    </button>
  );
}
