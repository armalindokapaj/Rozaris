"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

export function ModeSwitch({ className }: { className?: string }) {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const { t } = useT();

  return (
    <div className={cn("flex items-center gap-4", className)} role="tablist" aria-label={t("home.viewMode")}>
      <button
        role="tab"
        aria-selected={mode === "map"}
        onClick={() => setMode("map")}
        className={cn(
          "relative pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors",
          mode === "map"
            ? "text-neutral-900 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-neutral-900"
            : "text-neutral-400 hover:text-neutral-700"
        )}
      >
        {t("nav.map")}
      </button>
      <button
        role="tab"
        aria-selected={mode === "list"}
        onClick={() => setMode("list")}
        className={cn(
          "relative pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors",
          mode === "list"
            ? "text-neutral-900 after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-neutral-900"
            : "text-neutral-400 hover:text-neutral-700"
        )}
      >
        {t("nav.list")}
      </button>
    </div>
  );
}
