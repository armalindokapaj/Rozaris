"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { cn } from "@/lib/utils";
import { MODULE_ICONS, type ActiveModule } from "./types";

/**
 * Front Page PRD §8 — "The corresponding UI module may then appear above
 * the bottom bar." Explore never opens this (it's the default/fallback
 * camera mode, not a real overlay — see ViewerNavigation's doc comment).
 * Now only ever shows for mobile's own Units fallback (see layoutState.ts)
 * — "sunTime" and "views" are both excluded below, each with a real panel
 * of its own (SunTimeWorkspace, ViewsWorkspace) rendered alongside this
 * one instead.
 *
 * Stays permanently mounted and toggles via GSAP `autoAlpha`/`y` (PRD
 * §21 "Module Opening/Closing" is explicitly a GSAP item) rather than
 * conditional rendering — avoids having to delay React unmount until an
 * exit tween finishes.
 */
export function ViewerModuleLayer({
  activeModule,
  onClose,
  className,
}: {
  activeModule: ActiveModule;
  onClose: () => void;
  className?: string;
}) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = activeModule === "units";

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    gsap.to(el, {
      autoAlpha: open ? 1 : 0,
      y: open ? 0 : 12,
      duration: reducedMotion ? 0 : 0.3,
      ease: "power2.out",
    });
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const Icon = activeModule !== "none" ? MODULE_ICONS[activeModule] : null;
  const label = activeModule !== "none" ? t(`viewer.${activeModule}`) : "";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-hidden={!open}
      aria-label={label || undefined}
      className={cn(
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 rounded-panel p-4 text-center opacity-0",
        open ? "pointer-events-auto" : "pointer-events-none",
        className
      )}
    >
      {Icon && <Icon className="mx-auto mb-2 h-5 w-5 text-brand-400" aria-hidden="true" />}
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="mt-1 text-xs text-white/50">{t("viewer.moduleComingSoonBody")}</p>
    </div>
  );
}
