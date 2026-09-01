"use client";

import { ScanSearch } from "lucide-react";
import { pickDefaultQualityTier, QUALITY_PRESET_ORDER, QUALITY_TIERS } from "@/lib/viewerPresets";
import { GroupCard, SectionHeading, SelectRow, SliderRow, ToggleRow } from "../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { QualityPreset, RenderingMode } from "@/lib/types";

const PRESET_LABELS: Record<QualityPreset, string> = {
  ultra_desktop: "Ultra (Desktop)",
  high_desktop: "High (Desktop)",
  balanced: "Balanced",
  mobile_high: "Mobile — High",
  mobile_low: "Mobile — Low",
  custom: "Custom",
};

export function PerformancePanel({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const isCustom = draft.qualityPreset === "custom";
  const tier = QUALITY_TIERS[draft.qualityPreset];

  return (
    <div className="space-y-3">
      <SectionHeading>Quality Profiles</SectionHeading>
      <GroupCard>
        <SelectRow<QualityPreset>
          label="Profile"
          value={draft.qualityPreset}
          options={QUALITY_PRESET_ORDER.map((id) => ({ value: id, label: PRESET_LABELS[id] })).concat([{ value: "custom", label: "Custom" }])}
          onChange={(v) => update({ qualityPreset: v })}
        />
        <SelectRow<RenderingMode>
          label="Rendering Mode"
          value={draft.renderingMode}
          options={[
            { value: "auto", label: "Auto (WebGPU → WebGL2)" },
            { value: "webgpu", label: "WebGPU" },
            { value: "webgl2", label: "Force WebGL2" },
          ]}
          onChange={(v) => update({ renderingMode: v })}
        />
        <ToggleRow label="Device Detection" checked={draft.deviceDetectionEnabled} onChange={(v) => update({ deviceDetectionEnabled: v })} />
        {draft.deviceDetectionEnabled && (
          <button
            onClick={() => update({ qualityPreset: pickDefaultQualityTier() })}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800"
          >
            <ScanSearch className="h-3.5 w-3.5" /> Detect This Device
          </button>
        )}
      </GroupCard>

      {isCustom && (
        <>
          <SectionHeading>Custom</SectionHeading>
          <GroupCard>
            <SliderRow label="Render Scale" value={draft.customRenderScale ?? tier.renderScale} min={0.1} max={2} step={0.05} suffix="×" onChange={(v) => update({ customRenderScale: v })} />
            <SliderRow label="Pixel Ratio Limit" value={draft.customDprCap ?? tier.dprCap} min={0.5} max={3} step={0.05} suffix="×" onChange={(v) => update({ customDprCap: v })} />
          </GroupCard>
        </>
      )}

      <SectionHeading>Adaptive Quality</SectionHeading>
      <GroupCard>
        <ToggleRow label="Adaptive Quality" checked={draft.adaptiveQualityEnabled} onChange={(v) => update({ adaptiveQualityEnabled: v })} />
        <ToggleRow
          label="Runtime Quality Reduction"
          checked={draft.runtimeQualityReductionEnabled}
          disabled={!draft.adaptiveQualityEnabled}
          hint="Real: reduces render scale under sustained low frame rate"
          onChange={(v) => update({ runtimeQualityReductionEnabled: v })}
        />
        <ToggleRow
          label="Interaction Quality Reduction"
          checked={draft.interactionQualityReductionEnabled}
          disabled={!draft.adaptiveQualityEnabled}
          hint="Real: temporarily lowers render scale while dragging the camera, restores after"
          onChange={(v) => update({ interactionQualityReductionEnabled: v })}
        />
      </GroupCard>

      <SectionHeading>Budgets</SectionHeading>
      <GroupCard>
        <p className="p-1 text-[11px] text-neutral-500">
          Texture Budget, LOD Distances, Shadow Budget, Temporal Quality, Post FX Resolution, and Volumetric Resolution
          describe systems (real shadows, anti-aliasing, post-processing, volumetrics) that land in Phases 2-4 of this
          rebuild — not shown here yet rather than as inert controls.
        </p>
      </GroupCard>
    </div>
  );
}
