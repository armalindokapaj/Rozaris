import { useEffect } from "react";

/**
 * Shared `Escape`-closes-something hook (2026-08-18, extracted for the
 * Morphing Bottom Dock). Every existing Escape handler in this codebase
 * hand-rolled the exact same `useEffect` + `document.addEventListener`
 * pair (`ViewerModuleLayer.tsx`, `MoreMenu.tsx`, `ProjectDetailClient.tsx`'s
 * lightbox) — fine when each component only ever has one thing an Escape
 * press could close, but `ProjectViewerDock` has three nested layers
 * (popover → module → nav) that must close in that exact priority order,
 * one press at a time. Calling this hook independently per layer would
 * register 3 simultaneous listeners that all fire on a single Escape
 * press, closing every layer at once — so the dock calls this exactly
 * once, with `onEscape` itself encoding the priority chain (see
 * `ProjectViewerDock.tsx`), rather than one call site per layer.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onEscape]);
}
