"use client";

import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

/**
 * Rendering → Camera FX (PRD §27-30) — Bloom, Lens Flare, Depth of Field,
 * Distance Blur, Motion Blur. Bloom/DOF reuse pre-existing Project3DConfig
 * fields (they pre-date the v2 rebuild); Lens Flare/Motion Blur are new
 * (Phase 4); Distance Blur is the far-field-only counterpart to DOF.
 */
export function CameraFXSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const bloomOn = draft.bloomEnabled;
  const dofOn = draft.depthOfFieldEnabled;
  const motionBlurOn = draft.motionBlurEnabled;
  const distanceBlurOn = draft.distanceBlurEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Bloom</SectionHeading>
      <GroupCard>
        <ToggleRow label="Bloom" checked={bloomOn} onChange={(v) => update({ bloomEnabled: v })} />
        {/* 0-0.1, not the old 0-3: every usable bloom strength lives in the
            bottom 3% of that range, so a 0.05 step moved the scene from
            "off" to "blown out" in one keypress. */}
        <SliderRow label="Strength" value={draft.bloomStrength} min={0} max={0.1} step={0.005} disabled={!bloomOn} onChange={(v) => update({ bloomStrength: v })} />
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

      <SectionHeading>Distance Blur</SectionHeading>
      <GroupCard>
        <ToggleRow
          label="Distance Blur"
          checked={distanceBlurOn}
          onChange={(v) => update({ distanceBlurEnabled: v })}
          hint="Softens everything past a set distance. Unlike Depth of Field, the building never blurs — however far the visitor orbits out."
        />
        <SliderRow
          label="Sharp Until"
          value={draft.distanceBlurStartM}
          min={0}
          max={1000}
          step={5}
          suffix="m"
          disabled={!distanceBlurOn}
          onChange={(v) => update({ distanceBlurStartM: v })}
        />
        <SliderRow
          label="Fully Blurred At"
          value={draft.distanceBlurFullM}
          min={0}
          max={2000}
          step={10}
          suffix="m"
          disabled={!distanceBlurOn}
          onChange={(v) => update({ distanceBlurFullM: v })}
        />
        <SliderRow
          label="Amount"
          value={draft.distanceBlurAmount}
          min={0}
          max={1}
          step={0.05}
          disabled={!distanceBlurOn}
          onChange={(v) => update({ distanceBlurAmount: v })}
        />
        <SliderRow
          label="Radius"
          value={draft.distanceBlurRadius}
          min={0}
          max={8}
          step={0.25}
          suffix="px"
          disabled={!distanceBlurOn}
          onChange={(v) => update({ distanceBlurRadius: v })}
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
