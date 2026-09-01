"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Building2, Camera, LayoutGrid, Plane, Signpost, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { cn } from "@/lib/utils";
import type { CameraPreset } from "@/lib/types";
import type { ActiveModule } from "../viewer-hud/types";

function iconForPresetLabel(label: string) {
  const key = label.trim().toLowerCase();
  if (key.includes("exterior")) return Building2;
  if (key.includes("street")) return Signpost;
  if (key.includes("aerial")) return Plane;
  if (key.includes("neighborhood") || key.includes("neighbourhood")) return LayoutGrid;
  return Camera;
}

export function ViewsWorkspace({
  activeModule,
  isDesktop,
  presets,
  activePresetId,
  onSelectPreset,
  onClose,
}: {
  activeModule: ActiveModule;
  isDesktop: boolean;
  presets: CameraPreset[];
  activePresetId: string | null;
  onSelectPreset: (preset: CameraPreset) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = activeModule === "views";

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    gsap.to(el, {
      autoAlpha: open ? 1 : 0,
      y: open ? 0 : 12,
      duration: reducedMotion ? 0 : 0.3,
      ease: "power2.out",
    });
  }, [open, reducedMotion, isDesktop]);

  const presetRow =
    presets.length === 0 ? (
      <p className="flex items-center px-4 text-sm text-white/40">{t("views.empty")}</p>
    ) : (
      <div className="flex items-stretch gap-1 overflow-x-auto px-1">
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          const Icon = iconForPresetLabel(preset.label);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset)}
              aria-pressed={isActive}
              className={cn(
                "relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-control px-3 text-sm font-medium transition-colors sm:px-3.5",
                isActive ? "bg-brand-500/10 text-brand-400" : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {preset.label}
              {isActive && <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-400" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    );

  if (!isDesktop) {
    return (
      <div
        ref={panelRef}
        role="group"
        aria-label={t("viewer.views")}
        aria-hidden={!open}
        className={cn(
          "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-panel px-4 pb-4 pt-2.5 opacity-0",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        {                                                             
                                                                        }
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" aria-hidden="true" />
        {presetRow}
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={t("viewer.views")}
      aria-hidden={!open}
      className={cn(
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 flex min-h-[104px] w-fit max-w-[min(900px,calc(100vw-2rem))] -translate-x-1/2 items-stretch overflow-hidden rounded-panel px-3.5 ring-2 ring-brand-400/50 sm:px-4",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {presetRow}
      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        title={t("common.close")}
        className="flex shrink-0 items-center pl-3.5 text-white/50 transition-colors hover:text-white sm:pl-4"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
