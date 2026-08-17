"use client";

import { ColorRow, GroupCard, SectionHeading, SelectRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

/**
 * Environment → Ground — the PRD lists this as an Environment subtab
 * (§7) without its own dedicated spec section, so this reuses the
 * pre-existing, already-production-proven Ground Platform fields
 * (groundEnabled/groundStyle/groundColor) rather than inventing new
 * ones. Its "Ground Fog" radial-mist fields (groundFogEnabled/
 * groundFogRadius) still live here in the schema/renderer — the effect
 * paints onto this tab's own ground material — but the controls
 * themselves moved to the Fog & Haze panel (see FogSubtab.tsx) so every
 * fog-labeled toggle lives in one place instead of being split across
 * two tabs, which was silently defeating the master Fog switch.
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
    </div>
  );
}
