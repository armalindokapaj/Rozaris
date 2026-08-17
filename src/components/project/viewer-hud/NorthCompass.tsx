"use client";

import { useEffect, useRef } from "react";
import { Navigation2 } from "lucide-react";
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
 * No separate "N" label — just the needle glyph itself (removed per direct
 * design feedback; it previously sat fixed above the needle, which read as
 * cluttered once the needle could point any direction).
 *
 * `northOffsetDeg` is the admin-configured world-space bearing of true
 * north (Environment tab, `Project3DConfig.northOffsetDeg`) — without it
 * the needle would only reflect raw camera spin, not the project's real
 * orientation. Sign convention (needle rotates opposite the camera's
 * orbit so it keeps pointing the same screen-direction as true north):
 * verified by orbiting in a real headed browser; flip the subtraction
 * order here if a future model/scene convention ever disagrees.
 *
 * Click is a real button (48px target, focusable, labelled) but
 * deliberately a no-op for now — PRD §10 defers the reset-north
 * interaction itself to a separate spec ("The detailed interaction will
 * be defined separately"), same honest not-wired-yet pattern the rest of
 * this codebase already uses for future-facing toggles.
 *
 * `h-12 w-12` (direct design feedback, 2026-08-17) — matches
 * ProjectIdentity's own height exactly, same reference every other piece
 * of header/nav chrome now shares (see that component's doc comment).
 *
 * Redesigned twice on the same follow-up pass (2026-08-17): first to a
 * full `rounded-full` outer button; then corrected — the OUTER button
 * stays `rounded-panel` (matches ProjectIdentity/ViewerNavigation's own
 * corner radius, not a circle), and it's a smaller INNER badge that's the
 * actual purple circle around the needle (mirrors ViewsWorkspace's own
 * "VIEWS" title-icon badge — same nested "rounded-panel button containing
 * a smaller rounded-full accent circle" pattern). The circle's `ring-2
 * ring-brand-400` is a box-shadow-based utility, deliberately chosen over
 * `border-*` specifically because it doesn't fight `.viewer-glass`'s own
 * unlayered `border` declaration on the OUTER button (see UnitsWorkspace.
 * tsx's doc comment for that same cascade quirk; box-shadow is a
 * different property entirely, so no override trick is needed here).
 * Needle glyph swapped `Navigation` → `Navigation2` (a tighter, more
 * tapered dart shape that reads more like an actual compass needle) and
 * sized up slightly (18px→20px) to fill the circle with real presence.
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
      className="viewer-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-panel"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/15 ring-2 ring-brand-400/50">
        <Navigation2
          ref={needleRef}
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-brand-400"
          style={{ transformOrigin: "50% 50%" }}
        />
      </span>
    </button>
  );
}
