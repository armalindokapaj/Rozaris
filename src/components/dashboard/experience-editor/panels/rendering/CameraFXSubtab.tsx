"use client";

import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

/**
 * Rendering → Camera FX (PRD §27-30) — Bloom, Lens Flare, Depth of Field,
 * Motion Blur. Bloom/DOF reuse pre-existing Project3DConfig fields (they
 * pre-date the v2 rebuild); Lens Flare/Motion Blur are new (Phase 4).
 */
export function CameraFXSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const bloomOn = draft.bloomEnabled;
  const dofOn = draft.depthOfFieldEnabled;
  const motionBlurOn = draft.motionBlurEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Bloom</SectionHeading>
      <GroupCard>
        <ToggleRow label="Bloom" checked={bloomOn} onChange={(v) => update({ bloomEnabled: v })} />
        <SliderRow label="Strength" value={draft.bloomStrength} min={0} max={3} step={0.05} disabled={!bloomOn} onChange={(v) => update({ bloomStrength: v })} />
        <SliderRow label="Radius" value={draft.bloomRadius} min={0} max={1} step={0.05} disabled={!bloomOn} onChange={(v) => update({ bloomRadius: v })} />
      </GroupCard>

      <SectionHeading>Lens Flare</SectionHeading>
      <GroupCard>
        <ToggleRow
          label="Lens Flare"
          checked={draft.lensFlareEnabled}
          disabled={!bloomOn}
          onChange={(v) => update({ lensFlareEnabled: v })}
          hint={bloomOn ? undefined : "Requires Bloom — Lens Flare renders off Bloom's own bright-pass texture."}
        />
        <SliderRow
          label="Intensity"
          value={draft.lensFlareIntensity}
          min={0}
          max={3}
          step={0.05}
          disabled={!bloomOn || !draft.lensFlareEnabled}
          onChange={(v) => update({ lensFlareIntensity: v })}
        />
      </GroupCard>

      <SectionHeading>Depth of Field</SectionHeading>
      <GroupCard>
        <ToggleRow label="Depth of Field" checked={dofOn} onChange={(v) => update({ depthOfFieldEnabled: v })} />
        <ToggleRow
          label="Auto-Focus"
          checked={draft.cameraAutoFocusEnabled}
          disabled={!dofOn}
          onChange={(v) => update({ cameraAutoFocusEnabled: v })}
          hint="Focus tracks the live camera-to-orbit-target distance every frame."
        />
        <SliderRow
          label="Focal Length"
          value={draft.depthOfFieldFocalLength}
          min={0.1}
          max={200}
          step={0.5}
          disabled={!dofOn}
          onChange={(v) => update({ depthOfFieldFocalLength: v })}
        />
        <SliderRow
          label="Bokeh Scale"
          value={draft.depthOfFieldBokehScale}
          min={0}
          max={5}
          step={0.1}
          disabled={!dofOn}
          onChange={(v) => update({ depthOfFieldBokehScale: v })}
        />
      </GroupCard>

      <SectionHeading>Motion Blur</SectionHeading>
      <GroupCard>
        <ToggleRow label="Motion Blur" checked={motionBlurOn} onChange={(v) => update({ motionBlurEnabled: v })} />
        <SliderRow
          label="Intensity"
          value={draft.motionBlurIntensity}
          min={0}
          max={2}
          step={0.05}
          disabled={!motionBlurOn}
          onChange={(v) => update({ motionBlurIntensity: v })}
        />
      </GroupCard>
    </div>
  );
}
