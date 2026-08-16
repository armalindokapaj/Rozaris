"use client";

import { usePrefersReducedMotion } from "./useMediaQuery";
import { useViewerPreferences } from "./useViewerPreferences";

/**
 * More / Settings Menu PRD §13 "Reduced Motion" — a manual visitor toggle
 * that layers ON TOP of the OS-level `prefers-reduced-motion` query
 * (`usePrefersReducedMotion`), never replaces it: the OS preference alone
 * still reduces motion when the override is unset (null, the default),
 * and an explicit ON always reduces motion regardless of the OS setting.
 * An explicit OFF does NOT fight the OS setting — a visitor whose system
 * asks for reduced motion still gets it; "off" only means "don't ALSO
 * force it beyond what the OS already asks for", never "override the OS
 * accessibility preference away". Every GSAP-animated component in this
 * file tree (ViewerHUD, ViewerNavigation, SunTimeWorkspace,
 * ViewsWorkspace, UnitsWorkspace, FirstVisitHint) reads this instead of
 * `usePrefersReducedMotion` directly so the Settings toggle actually
 * reaches every real animation, not just new ones.
 */
export function useEffectiveReducedMotion() {
  const osPrefers = usePrefersReducedMotion();
  const { reducedMotionOverride } = useViewerPreferences();
  if (reducedMotionOverride === true) return true;
  return osPrefers;
}
