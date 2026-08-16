"use client";

import { GroupCard, SectionHeading, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

/**
 * Rendering → Anti-Aliasing (PRD §25) — real TRAA (temporal reprojection
 * AA, vendored `TRAANode`) replacing this app's old browser-MSAA-only
 * behavior under the SAME `antialiasEnabled` toggle (default unchanged).
 * The one field in this whole tab that triggers a real renderer remount
 * (RenderEngine.ts's setRenderingConfig) — MSAA must be off at the
 * renderer for TRAA to be valid, so flipping this rebuilds the renderer
 * itself, not just the post pipeline.
 */
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
