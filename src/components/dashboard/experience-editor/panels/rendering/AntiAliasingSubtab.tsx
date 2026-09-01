"use client";

import { GroupCard, SectionHeading, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

export function AntiAliasingSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;

  return (
    <div className="space-y-3">
      <SectionHeading>Anti-Aliasing</SectionHeading>
      <GroupCard>
        <ToggleRow
          label="TRAA"
          checked={draft.antialiasEnabled}
          onChange={(v) => update({ antialiasEnabled: v })}
          hint="Temporal reprojection anti-aliasing — smooths edges over time using motion vectors. Off falls back to plain hardware MSAA. Changing this re-mounts the viewport."
        />
      </GroupCard>
    </div>
  );
}
