"use client";

import { GroupCard, SectionHeading, SelectRow, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

export function ShadowsSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const shadowsOn = draft.shadowsEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Shadows</SectionHeading>
      <GroupCard>
        <ToggleRow label="Shadows" checked={shadowsOn} onChange={(v) => update({ shadowsEnabled: v })} />
        <ToggleRow label="Soft Shadows" checked={draft.softShadowsEnabled} disabled={!shadowsOn} onChange={(v) => update({ softShadowsEnabled: v })} />
        <SliderRow label="Softness" value={draft.shadowSoftness} min={0} max={10} step={0.1} disabled={!shadowsOn || !draft.softShadowsEnabled} onChange={(v) => update({ shadowSoftness: v })} />
      </GroupCard>

      <SectionHeading>Cascaded Shadow Maps</SectionHeading>
      <GroupCard>
        <ToggleRow label="CSM" checked={draft.csmEnabled} disabled={!shadowsOn} onChange={(v) => update({ csmEnabled: v })} />
        <SliderRow label="Cascades" value={draft.csmCascades} min={1} max={4} step={1} disabled={!shadowsOn || !draft.csmEnabled} onChange={(v) => update({ csmCascades: v })} />
        <SliderRow label="Max Distance" value={draft.csmMaxDistance} min={10} max={2000} step={10} suffix="m" disabled={!shadowsOn || !draft.csmEnabled} onChange={(v) => update({ csmMaxDistance: v })} />
        <SelectRow
          label="Resolution"
          value={String(draft.csmResolution)}
          disabled={!shadowsOn || !draft.csmEnabled}
          options={[
            { value: "512", label: "512" },
            { value: "1024", label: "1024" },
            { value: "2048", label: "2048" },
            { value: "4096", label: "4096" },
          ]}
          onChange={(v) => update({ csmResolution: Number(v) })}
        />
        <SelectRow
          label="Split Mode"
          value={draft.csmSplitMode}
          disabled={!shadowsOn || !draft.csmEnabled}
          options={[
            { value: "practical", label: "Practical" },
            { value: "uniform", label: "Uniform" },
            { value: "logarithmic", label: "Logarithmic" },
          ]}
          onChange={(v) => update({ csmSplitMode: v })}
        />
        <SliderRow label="Margin" value={draft.csmMargin} min={0} max={1000} step={10} suffix="m" disabled={!shadowsOn || !draft.csmEnabled} onChange={(v) => update({ csmMargin: v })} />
      </GroupCard>

      <SectionHeading>Contact Shadows</SectionHeading>
      <GroupCard>
        <ToggleRow label="Contact Shadows" checked={draft.contactShadowsEnabled} disabled={!shadowsOn} onChange={(v) => update({ contactShadowsEnabled: v })} />
        <SliderRow label="Blur" value={draft.contactShadowBlur} min={0} max={2} step={0.05} disabled={!shadowsOn || !draft.contactShadowsEnabled} onChange={(v) => update({ contactShadowBlur: v })} />
        <SliderRow label="Darkness" value={draft.contactShadowDarkness} min={0} max={1} step={0.01} disabled={!shadowsOn || !draft.contactShadowsEnabled} onChange={(v) => update({ contactShadowDarkness: v })} />
        <SliderRow label="Opacity" value={draft.contactShadowOpacity} min={0} max={1} step={0.01} disabled={!shadowsOn || !draft.contactShadowsEnabled} onChange={(v) => update({ contactShadowOpacity: v })} />
        <SliderRow label="Range" value={draft.contactShadowRange} min={0.02} max={5} step={0.02} suffix="m" disabled={!shadowsOn || !draft.contactShadowsEnabled} onChange={(v) => update({ contactShadowRange: v })} />
      </GroupCard>

      <SectionHeading>Transmitted / Colored Shadows</SectionHeading>
      <GroupCard>
        <ToggleRow
          label="Transmitted Shadows"
          checked={draft.transmittedShadowsEnabled}
          disabled={!shadowsOn}
          onChange={(v) => update({ transmittedShadowsEnabled: v })}
          hint="Applies to Glass_* named GLB nodes"
        />
        <ToggleRow label="Colored Shadows" checked={draft.coloredShadowsEnabled} disabled={!shadowsOn || !draft.transmittedShadowsEnabled} onChange={(v) => update({ coloredShadowsEnabled: v })} />
        <SliderRow
          label="Transmission Strength"
          value={draft.transmittedShadowStrength}
          min={0}
          max={1}
          step={0.01}
          disabled={!shadowsOn || !draft.transmittedShadowsEnabled}
          onChange={(v) => update({ transmittedShadowStrength: v })}
        />
      </GroupCard>
    </div>
  );
}
