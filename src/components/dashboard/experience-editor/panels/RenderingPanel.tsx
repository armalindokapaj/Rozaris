"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ReflectionsSubtab } from "./rendering/ReflectionsSubtab";
import { AntiAliasingSubtab } from "./rendering/AntiAliasingSubtab";
import { CameraFXSubtab } from "./rendering/CameraFXSubtab";
import { ColorSubtab } from "./rendering/ColorSubtab";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

type RenderingSubtab = "reflections" | "antialiasing" | "camerafx" | "color";

const SUBTABS: { id: RenderingSubtab; label: string }[] = [
  { id: "reflections", label: "Reflections" },
  { id: "antialiasing", label: "Anti-Aliasing" },
  { id: "camerafx", label: "Camera FX" },
  { id: "color", label: "Color" },
];

/**
 * Rendering tab (PRD §22-33) — 4 subtabs. Extends the SAME shared post
 * pipeline the Lighting tab built (render-engine/postProcessing.ts's
 * buildScenePostPipeline) — every field here is real, live-applied with
 * no remount except Anti-Aliasing's own toggle (RenderEngine.ts's
 * setRenderingConfig), persisted through the same Project3DConfig PATCH
 * route every other tab already uses.
 */
export function RenderingPanel({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const [subtab, setSubtab] = useState<RenderingSubtab>("reflections");

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
      {subtab === "reflections" && <ReflectionsSubtab configEditor={configEditor} />}
      {subtab === "antialiasing" && <AntiAliasingSubtab configEditor={configEditor} />}
      {subtab === "camerafx" && <CameraFXSubtab configEditor={configEditor} />}
      {subtab === "color" && <ColorSubtab configEditor={configEditor} />}
    </div>
  );
}
