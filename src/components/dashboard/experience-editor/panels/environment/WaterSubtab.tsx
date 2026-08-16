"use client";

import { ColorRow, GroupCard, SectionHeading, SliderRow, SelectRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

/**
 * Environment → Water (PRD §13, `webgpu_ocean.html` parity) — extends the
 * pre-existing WaterMesh wiring. Honest split (RenderEngine.ts's
 * applyEnvironmentConfig doc comment carries the full reasoning): Water/
 * Sun Reflection/Waves/Normal Map/Height/Color/Size/Distortion are REAL;
 * Movement and Environment Reflection are stored (flip and persist, per
 * PRD's own ON/OFF contract) but not yet wired to a visible difference —
 * WaterMesh's shared shader has no per-instance pause and its planar
 * reflector is baked in at construction, not a runtime toggle.
 */
export function WaterSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const on = draft.waterEnabled;
  const notWiredYet = "Stored — not yet wired to a visible render difference";

  return (
    <div className="space-y-3">
      <SectionHeading>Water</SectionHeading>
      <GroupCard>
        <ToggleRow label="Water" checked={on} onChange={(v) => update({ waterEnabled: v })} />
        <SelectRow
          label="Type"
          value={draft.waterType}
          disabled={!on}
          options={[
            { value: "sea", label: "Sea" },
            { value: "lake", label: "Lake" },
            { value: "pool", label: "Pool" },
            { value: "decorative", label: "Decorative" },
          ]}
          onChange={(v) => update({ waterType: v })}
        />
        <ToggleRow label="Waves" checked={draft.waterWavesEnabled} disabled={!on} onChange={(v) => update({ waterWavesEnabled: v })} />
        <ToggleRow label="Movement" checked={draft.waterMovementEnabled} disabled={!on} onChange={(v) => update({ waterMovementEnabled: v })} hint={notWiredYet} />
        <ToggleRow label="Sun Reflection" checked={draft.waterSunReflectionEnabled} disabled={!on} onChange={(v) => update({ waterSunReflectionEnabled: v })} />
        <ToggleRow label="Environment Reflection" checked={draft.waterEnvReflectionEnabled} disabled={!on} onChange={(v) => update({ waterEnvReflectionEnabled: v })} hint={notWiredYet} />
        <ToggleRow label="Normal Map" checked={draft.waterNormalMapEnabled} disabled={!on} onChange={(v) => update({ waterNormalMapEnabled: v })} />
      </GroupCard>

      <SectionHeading>Surface</SectionHeading>
      <GroupCard>
        <SliderRow label="Water Height" value={draft.waterHeight} min={-100} max={100} step={0.5} suffix="m" disabled={!on} onChange={(v) => update({ waterHeight: v })} />
        <SliderRow label="Size" value={draft.waterSize} min={0.1} max={10} step={0.1} disabled={!on} onChange={(v) => update({ waterSize: v })} />
        <ColorRow label="Water Color" value={draft.waterColor} disabled={!on} onChange={(v) => update({ waterColor: v })} />
        <ColorRow label="Deep Color" value={draft.waterDeepColor} disabled={!on} onChange={(v) => update({ waterDeepColor: v })} />
        <SliderRow label="Distortion" value={draft.waterDistortionScale} min={0} max={8} step={0.1} disabled={!on} onChange={(v) => update({ waterDistortionScale: v })} />
      </GroupCard>
    </div>
  );
}
