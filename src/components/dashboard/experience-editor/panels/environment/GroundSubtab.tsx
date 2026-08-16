"use client";

import { ColorRow, GroupCard, SectionHeading, SelectRow, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

/**
 * Environment → Ground — the PRD lists this as an Environment subtab
 * (§7) without its own dedicated spec section, so this reuses the
 * pre-existing, already-production-proven Ground Platform fields
 * (groundEnabled/groundStyle/groundColor/groundFogEnabled/
 * groundFogRadius) rather than inventing new ones. "Ground Fog" here is
 * its own older radial-mist-around-origin technique on the ground
 * material itself — distinct from Fog & Haze's real height-band fog.
 */
export function GroundSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const on = draft.groundEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Ground</SectionHeading>
      <GroupCard>
        <ToggleRow label="Ground" checked={on} onChange={(v) => update({ groundEnabled: v })} />
        <SelectRow
          label="Style"
          value={draft.groundStyle}
          disabled={!on}
          options={[
            { value: "disc", label: "Disc (fits content)" },
            { value: "infinite", label: "Infinite plane" },
          ]}
          onChange={(v) => update({ groundStyle: v })}
        />
        <ColorRow label="Ground Color" value={draft.groundColor} disabled={!on} onChange={(v) => update({ groundColor: v })} />
      </GroupCard>

      <SectionHeading>Ground Fog</SectionHeading>
      <GroupCard>
        <ToggleRow label="Ground Fog" checked={draft.groundFogEnabled} disabled={!on} onChange={(v) => update({ groundFogEnabled: v })} hint="A radial mist fade around world origin on the ground material — distinct from Fog & Haze's height-band fog" />
        <SliderRow label="Radius" value={draft.groundFogRadius} min={1} max={2000} step={5} suffix="m" disabled={!on || !draft.groundFogEnabled} onChange={(v) => update({ groundFogRadius: v })} />
      </GroupCard>
    </div>
  );
}
