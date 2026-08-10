"use client";

import { SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useCompareHint } from "@/hooks/useCompareHint";
import { CompareHint } from "@/components/compare/CompareHint";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

export function ModeSwitch({ className }: { className?: string }) {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const compareCount = useAppStore((s) => s.compare.length);
  const { hint, hintRef, handleCompareClick } = useCompareHint();
  const { t } = useT();

  return (
    <>
      <div
        className={cn("flex items-center gap-4", className)}
        role="tablist"
        aria-label={t("home.viewMode")}
      >
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
        <button
          onClick={handleCompareClick}
          aria-label={t("nav.compare")}
          className="relative flex items-center pb-1 text-neutral-500 hover:text-neutral-900"
        >
          <SquareStack className="h-4 w-4" />
          {compareCount > 0 && (
            <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-500 px-0.5 text-[9px] font-bold text-white">
              {compareCount}
            </span>
          )}
        </button>
      </div>

      <CompareHint hint={hint} hintRef={hintRef} />
    </>
  );
}
