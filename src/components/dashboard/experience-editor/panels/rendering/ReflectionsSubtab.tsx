"use client";

import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

export function ReflectionsSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const on = draft.ssrEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Screen-Space Reflections</SectionHeading>
      <GroupCard>
        <ToggleRow
          label="Reflections"
          checked={on}
          onChange={(v) => update({ ssrEnabled: v })}
          hint="Real screen-space reflections off glass, polished floors, and metal — has no visible effect on a scene with no reflective materials."
        />
      </GroupCard>

      <SectionHeading>Quality</SectionHeading>
      <GroupCard>
        <SliderRow label="Intensity" value={draft.ssrIntensity} min={0} max={3} step={0.05} disabled={!on} onChange={(v) => update({ ssrIntensity: v })} />
        <SliderRow label="Max Distance" value={draft.ssrMaxDistance} min={1} max={200} step={1} disabled={!on} onChange={(v) => update({ ssrMaxDistance: v })} />
        <SliderRow label="Thickness" value={draft.ssrThickness} min={0.01} max={5} step={0.01} disabled={!on} onChange={(v) => update({ ssrThickness: v })} />
        <SliderRow
          label="Ray Quality"
          value={draft.ssrQuality}
          min={0}
          max={1}
          step={0.05}
          disabled={!on}
          onChange={(v) => update({ ssrQuality: v })}
        />
      </GroupCard>
    </div>
  );
}
