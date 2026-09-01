"use client";

import { useRef } from "react";
import { useT } from "@/lib/i18n/useT";
import { FiltersForm } from "./FiltersForm";

export function FiltersPanel() {
  const { t } = useT();

  const scrollRef = useRef<HTMLDivElement>(null);
  function forwardWheelToFilters(e: React.WheelEvent) {
    if (!scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollTop += e.deltaY;
  }

  return (
    <div className="glass-panel flex h-full flex-col overflow-hidden rounded-panel">
      <div
        onWheel={forwardWheelToFilters}
        className="shrink-0 border-b border-neutral-100 px-5 pt-5 pb-4"
      >
        <h1 className="font-serif text-lg text-neutral-900">{t("home.findPerfectProperty")}</h1>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin">
        <FiltersForm />
      </div>
    </div>
  );
}
