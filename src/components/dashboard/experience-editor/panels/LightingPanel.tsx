"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SunLightSubtab } from "./lighting/SunLightSubtab";
import { ShadowsSubtab } from "./lighting/ShadowsSubtab";
import { GlobalIlluminationSubtab } from "./lighting/GlobalIlluminationSubtab";
import { ArtificialLightsSubtab } from "./lighting/ArtificialLightsSubtab";
import { VolumetricLightingSubtab } from "./lighting/VolumetricLightingSubtab";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

type LightingSubtab = "sun" | "shadows" | "gi" | "lights" | "volumetric";

const SUBTABS: { id: LightingSubtab; label: string }[] = [
  { id: "sun", label: "Sun Light" },
  { id: "shadows", label: "Shadows" },
  { id: "gi", label: "Global Illumination" },
  { id: "lights", label: "Artificial Lights" },
  { id: "volumetric", label: "Volumetric" },
];

/**
 * Lighting tab (PRD §14-21) — 5 subtabs. Every field here is real,
 * live-applied to the viewport with no remount where the underlying
 * three.js node supports it (RenderEngine.ts's setLightingConfig),
 * persisted through the same Project3DConfig PATCH route every other tab
 * already uses.
 */
export function LightingPanel({ configEditor, projectId }: { configEditor: UseProjectConfigEditorReturn; projectId: string }) {
  const [subtab, setSubtab] = useState<LightingSubtab>("sun");

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-neutral-900 p-0.5">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubtab(t.id)}
            className={cn(
              "rounded px-1.5 py-1 text-[10px] font-semibold",
              subtab === t.id ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-100"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {subtab === "sun" && <SunLightSubtab configEditor={configEditor} />}
      {subtab === "shadows" && <ShadowsSubtab configEditor={configEditor} />}
      {subtab === "gi" && <GlobalIlluminationSubtab configEditor={configEditor} />}
      {subtab === "lights" && <ArtificialLightsSubtab configEditor={configEditor} projectId={projectId} />}
      {subtab === "volumetric" && <VolumetricLightingSubtab configEditor={configEditor} />}
    </div>
  );
}
