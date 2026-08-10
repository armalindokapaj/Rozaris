"use client";

import { useRef } from "react";
import { useT } from "@/lib/i18n/useT";
import { FiltersForm } from "./FiltersForm";

export function FiltersPanel() {
  const { t } = useT();

  // The title header above has no scroll of its own, so a wheel gesture
  // there does nothing by default — forward it to the filters scroll
  // container below so scrolling works from anywhere in the panel, without
  // moving or extending the visible scrollbar into the header. Same logic
  // as the right results panel.
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
        <h1 className="text-[17px] font-bold text-neutral-900">{t("home.findPerfectProperty")}</h1>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin">
        <FiltersForm />
      </div>
    </div>
  );
}
