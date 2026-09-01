"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SunSkySubtab } from "./environment/SunSkySubtab";
import { CloudsSubtab } from "./environment/CloudsSubtab";
import { FogSubtab } from "./environment/FogSubtab";
import { WaterSubtab } from "./environment/WaterSubtab";
import { GroundSubtab } from "./environment/GroundSubtab";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

type EnvironmentSubtab = "sun-sky" | "clouds" | "fog" | "water" | "ground";

const SUBTABS: { id: EnvironmentSubtab; label: string }[] = [
  { id: "sun-sky", label: "Sun & Sky" },
  { id: "clouds", label: "Clouds" },
  { id: "fog", label: "Fog & Haze" },
  { id: "water", label: "Water" },
  { id: "ground", label: "Ground" },
];

export function EnvironmentPanel({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const [subtab, setSubtab] = useState<EnvironmentSubtab>("sun-sky");

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex gap-1 rounded-md bg-neutral-900 p-0.5">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubtab(t.id)}
            className={cn(
              "flex-1 rounded px-1.5 py-1 text-[10.5px] font-semibold",
              subtab === t.id ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-100"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {subtab === "sun-sky" && <SunSkySubtab configEditor={configEditor} />}
      {subtab === "clouds" && <CloudsSubtab configEditor={configEditor} />}
      {subtab === "fog" && <FogSubtab configEditor={configEditor} />}
      {subtab === "water" && <WaterSubtab configEditor={configEditor} />}
      {subtab === "ground" && <GroundSubtab configEditor={configEditor} />}
    </div>
  );
}
