"use client";

import { GroupCard, SectionHeading, SelectRow, SliderRow, ToggleRow } from "../../fields";
import { LUT_PRESETS } from "@/lib/viewerPresets";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { ToneMapping } from "@/lib/types";

const TONE_MAPPING_OPTIONS: { value: ToneMapping; label: string }[] = [
  { value: "none", label: "None" },
  { value: "linear", label: "Linear" },
  { value: "reinhard", label: "Reinhard" },
  { value: "cineon", label: "Cineon" },
  { value: "aces", label: "ACES Filmic" },
  { value: "agx", label: "AgX" },
  { value: "neutral", label: "Neutral" },
];

/**
 * Rendering → Color (PRD §31-33) — Tone Mapping/Exposure (plain renderer
 * properties, live, no rebuild) + 3D LUT color grading (real `Lut3DNode`,
 * one of 9 real vendored LUT files — `webgl_postprocessing_3dlut.html`
 * parity). All 3 pre-date the v2 rebuild's field set; this is their first
 * real UI in the new engine.
 */
export function ColorSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const lutOn = draft.lutEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Tone Mapping</SectionHeading>
      <GroupCard>
        <SelectRow label="Curve" value={draft.toneMapping} options={TONE_MAPPING_OPTIONS} onChange={(v) => update({ toneMapping: v })} />
        <SliderRow label="Exposure" value={draft.exposure} min={0} max={4} step={0.05} onChange={(v) => update({ exposure: v })} />
      </GroupCard>

      <SectionHeading>3D LUT</SectionHeading>
      <GroupCard>
        <ToggleRow label="3D LUT" checked={lutOn} onChange={(v) => update({ lutEnabled: v })} />
        <SelectRow
          label="Preset"
          value={draft.lutPreset}
          options={LUT_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          disabled={!lutOn}
          onChange={(v) => update({ lutPreset: v })}
        />
        <SliderRow label="Intensity" value={draft.lutIntensity} min={0} max={1} step={0.05} disabled={!lutOn} onChange={(v) => update({ lutIntensity: v })} />
      </GroupCard>
    </div>
  );
}
