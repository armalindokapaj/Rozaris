"use client";

import { List, Map as MapIcon, SquareStack } from "lucide-react";
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
        className={cn(
          "glass-panel flex items-center gap-0.5 rounded-panel p-1",
          className
        )}
        role="tablist"
        aria-label={t("home.viewMode")}
      >
        <button
          role="tab"
          aria-selected={mode === "map"}
          onClick={() => setMode("map")}
          className={cn(
            "flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-sm font-semibold transition-colors",
            mode === "map" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
          )}
        >
          <MapIcon className="h-4 w-4" /> {t("nav.map")}
        </button>
        <button
          role="tab"
          aria-selected={mode === "list"}
          onClick={() => setMode("list")}
          className={cn(
            "flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-sm font-semibold transition-colors",
            mode === "list" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
          )}
        >
          <List className="h-4 w-4" /> {t("nav.list")}
        </button>
        <button
          onClick={handleCompareClick}
          className="flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900"
        >
          <SquareStack className="h-4 w-4" /> {t("nav.compare")}
          {compareCount > 0 && (
            <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
              {compareCount}
            </span>
          )}
        </button>
      </div>

      <CompareHint hint={hint} hintRef={hintRef} />
    </>
  );
}
