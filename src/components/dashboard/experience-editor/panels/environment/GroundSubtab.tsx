"use client";

import { ColorRow, GroupCard, SectionHeading, SelectRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

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
