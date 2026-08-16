"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { gsap } from "gsap";
import { useT } from "@/lib/i18n/useT";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";

const STORAGE_KEY = "rozaris:viewerHintSeen";

function subscribe() {
  // localStorage doesn't need a live subscription here — this component
  // only ever reads the flag once per mount and writes it itself
  // (imperatively, in `dismiss`) rather than through a state setter, so
  // there's nothing external to notify it of.
  return () => {};
}
function getSnapshot() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return "1"; // storage unavailable (private mode, etc.) — treat as already-seen
  }
}
function getServerSnapshot() {
  return "1"; // SSR: assume seen, avoids a hydration-time flash; the real client read happens on mount
}

/**
 * Front Page PRD §13 — "Drag to explore" / "Swipe to explore". Shows once
 * per browser (localStorage, not sessionStorage — the PRD's "only for new
 * users" reads as broader than just "not twice in one tab session"),
 * fades automatically after ~2.6s, and disappears immediately on the
 * visitor's first pointer interaction anywhere in the viewer.
 *
 * `ready` gates this on the load sequence having actually finished
 * (ViewerHUD's Stage 5) — showing a "drag to explore" hint while the
 * scene itself is still loading would be actively wrong.
 *
 * Reads the "seen" flag via `useSyncExternalStore` (same escape hatch
 * `useMediaQuery` already uses in this codebase for `window.matchMedia`)
 * rather than an effect + `setState` — this project's `react-hooks/refs`-
 * adjacent lint config flags synchronous `setState` inside an effect body.
 */
export function FirstVisitHint({ ready }: { ready: boolean }) {
  const { t } = useT();
  const isDesktop = useIsDesktop();
  const reducedMotion = useEffectiveReducedMotion();
  const elRef = useRef<HTMLDivElement>(null);
  const dismissedRef = useRef(false);
  const seenFlag = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const shouldRender = ready && !seenFlag;

  useEffect(() => {
    if (!shouldRender) return;
    const el = elRef.current;
    if (!el) return;

    function dismiss() {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore — worst case it shows again next load
      }
      gsap.to(el, { autoAlpha: 0, duration: reducedMotion ? 0.001 : 0.25, ease: "power1.out" });
    }

    gsap.fromTo(
      el,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: reducedMotion ? 0.001 : 0.4, ease: "power1.out" }
    );
    const fadeTimer = setTimeout(dismiss, 2600);
    window.addEventListener("pointerdown", dismiss, { once: true, passive: true });

    return () => {
      clearTimeout(fadeTimer);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [shouldRender, reducedMotion]);

  if (!shouldRender) return null;

  return (
    <div
      ref={elRef}
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-[60%] z-10 -translate-x-1/2 opacity-0"
    >
      <p className="viewer-glass rounded-pill px-4 py-2 text-xs font-medium text-white/80">
        {isDesktop ? t("viewer.dragToExplore") : t("viewer.swipeToExplore")}
      </p>
    </div>
  );
}
