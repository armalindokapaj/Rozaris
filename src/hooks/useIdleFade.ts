"use client";

import { useEffect, useState } from "react";

/**
 * More / Settings Menu PRD §14 "Interface Auto-Hide" — "Viewer controls
 * subtly reduce visibility after inactivity. Any pointer/touch
 * interaction immediately restores them." Tracks idle/active off real
 * pointer/touch/wheel activity; the caller (ViewerHUD) decides what
 * "idle" actually does visually and whether the `interfaceAutoHide`
 * preference is even on — this hook doesn't know about that preference,
 * keeping it a plain, reusable idle-timer primitive.
 */
export function useIdleFade(idleAfterMs = 3500): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function markActive() {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), idleAfterMs);
    }
    // Deferred rather than called synchronously here — this codebase's
    // react-hooks/set-state-in-effect rule rejects a direct setState call
    // in the effect body itself; scheduling it (even at 0ms) moves the
    // actual state update into its own task, same category as the
    // pointer-event callbacks below.
    const startTimer = setTimeout(markActive, 0);

    window.addEventListener("pointermove", markActive);
    window.addEventListener("pointerdown", markActive);
    window.addEventListener("touchstart", markActive, { passive: true });
    window.addEventListener("wheel", markActive, { passive: true });
    return () => {
      clearTimeout(startTimer);
      clearTimeout(timer);
      window.removeEventListener("pointermove", markActive);
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("touchstart", markActive);
      window.removeEventListener("wheel", markActive);
    };
  }, [idleAfterMs]);

  return idle;
}
