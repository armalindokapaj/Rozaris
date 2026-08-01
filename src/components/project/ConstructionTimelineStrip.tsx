"use client";

import { useState } from "react";
import { Check, Clock } from "lucide-react";
import type { ConstructionStage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ConstructionTimelineStrip({
  stages,
  overallPercent,
}: {
  stages: ConstructionStage[];
  overallPercent: number;
}) {
  const activeIndex = stages.findIndex((s) => s.status === "active");
  const [selected, setSelected] = useState(activeIndex >= 0 ? activeIndex : 0);
  const stage = stages[selected];

  return (
    <div className="glass-panel-dark rounded-panel p-4 text-white">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Construction progress</p>
        <span className="text-sm font-bold text-brand-300">{overallPercent}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={stages.length - 1}
        step={1}
        value={selected}
        onChange={(e) => setSelected(Number(e.target.value))}
        aria-label="Scrub construction timeline"
        className="w-full accent-brand-400"
      />
      <div className="mt-2 flex justify-between gap-1">
        {stages.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setSelected(i)}
            aria-label={s.name}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i === selected
                ? "bg-brand-400"
                : s.status === "done"
                ? "bg-white/60"
                : "bg-white/15"
            )}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        {stage.status === "done" ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Clock className="h-4 w-4 text-brand-300" />
        )}
        <span className="font-medium">{stage.name}</span>
        <span className="text-white/50">· {stage.dateLabel}</span>
      </div>
    </div>
  );
}
