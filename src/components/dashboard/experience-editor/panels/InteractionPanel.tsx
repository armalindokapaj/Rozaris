"use client";

import { GroupCard, SectionHeading, ToggleRow } from "../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { ViewerUIToggles } from "@/lib/types";

/**
 * Interaction tab (PRD §39) — Units/Filters/Viewer Controls, all real,
 * persisted toggles on the pre-existing `Project3DConfig.viewerUI` field
 * (extended this pass, no migration needed — it's a nullable Json?
 * column). Honest per-toggle: Fullscreen/Screenshot/Information Card are
 * wired into the real public viewer (ArchVizClient.tsx) now; the rest
 * (3D hover/select/highlight/isolation, Filters UI, a public Shots menu)
 * gate systems the ground-up-rebuilt public viewer doesn't have yet —
 * each says so via its hint rather than pretending otherwise. The Viewer
 * Time Slider is deliberately NOT here (PRD §39: "configured only under
 * Environment → Sun & Sky").
 */
export function InteractionPanel({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const ui = draft.viewerUI;

  function set(patch: Partial<ViewerUIToggles>) {
    update({ viewerUI: { ...ui, ...patch } });
  }

  const notBuilt = "Lands once the public viewer's own Interaction systems are rebuilt in this v2 engine";

  return (
    <div className="space-y-3">
      <SectionHeading>Units</SectionHeading>
      <GroupCard>
        <ToggleRow label="Unit Interaction" checked={ui.unitInteractionEnabled !== false} onChange={(v) => set({ unitInteractionEnabled: v })} hint={notBuilt} />
        <ToggleRow label="Hover" checked={ui.hoverEnabled !== false} onChange={(v) => set({ hoverEnabled: v })} hint={notBuilt} />
        <ToggleRow label="Select" checked={ui.selectEnabled !== false} onChange={(v) => set({ selectEnabled: v })} hint={notBuilt} />
        <ToggleRow label="Highlight" checked={ui.highlightEnabled !== false} onChange={(v) => set({ highlightEnabled: v })} hint={notBuilt} />
        <ToggleRow label="Status Colors" checked={ui.statusColorsEnabled !== false} onChange={(v) => set({ statusColorsEnabled: v })} hint="Real in the admin editor's own Unit Mapping → Status Preview; not yet on the public viewer" />
        <ToggleRow label="Isolation" checked={ui.isolationEnabled !== false} onChange={(v) => set({ isolationEnabled: v })} hint={notBuilt} />
        <ToggleRow label="Floor Isolation" checked={ui.floorIsolationEnabled !== false} onChange={(v) => set({ floorIsolationEnabled: v })} hint={notBuilt} />
        <ToggleRow label="Information Card" checked={ui.showUnitInfo !== false} onChange={(v) => set({ showUnitInfo: v })} />
        <ToggleRow label="Unit Page Link" checked={ui.unitPageLinkEnabled !== false} onChange={(v) => set({ unitPageLinkEnabled: v })} hint={notBuilt} />
      </GroupCard>

      <SectionHeading>Filters</SectionHeading>
      <GroupCard>
        <ToggleRow label="Filters" checked={ui.filtersEnabled !== false} onChange={(v) => set({ filtersEnabled: v })} hint="No public Filters UI built yet" />
        <ToggleRow label="Floor" checked={ui.filterFloorEnabled !== false} disabled={ui.filtersEnabled === false} onChange={(v) => set({ filterFloorEnabled: v })} />
        <ToggleRow label="Availability" checked={ui.filterAvailabilityEnabled !== false} disabled={ui.filtersEnabled === false} onChange={(v) => set({ filterAvailabilityEnabled: v })} />
        <ToggleRow label="Bedrooms" checked={ui.filterBedroomsEnabled !== false} disabled={ui.filtersEnabled === false} onChange={(v) => set({ filterBedroomsEnabled: v })} />
        <ToggleRow label="Type" checked={ui.filterTypeEnabled !== false} disabled={ui.filtersEnabled === false} onChange={(v) => set({ filterTypeEnabled: v })} />
        <ToggleRow label="Price" checked={ui.filterPriceEnabled !== false} disabled={ui.filtersEnabled === false} onChange={(v) => set({ filterPriceEnabled: v })} />
      </GroupCard>

      <SectionHeading>Viewer Controls</SectionHeading>
      <GroupCard>
        <ToggleRow label="Reset" checked={ui.resetEnabled !== false} onChange={(v) => set({ resetEnabled: v })} hint={notBuilt} />
        <ToggleRow label="Fullscreen" checked={ui.fullscreenEnabled !== false} onChange={(v) => set({ fullscreenEnabled: v })} />
        <ToggleRow label="Shots" checked={ui.shotsMenuEnabled !== false} onChange={(v) => set({ shotsMenuEnabled: v })} hint="No public Shots menu built yet" />
        <ToggleRow label="Sections" checked={ui.sectionsEnabled !== false} onChange={(v) => set({ sectionsEnabled: v })} hint="No public Sections activation UI built yet" />
        <ToggleRow label="Filters" checked={ui.filtersEnabled !== false} disabled onChange={() => {}} hint="Same switch as Filters above" />
        <ToggleRow label="Screenshot" checked={ui.screenshotEnabled !== false} onChange={(v) => set({ screenshotEnabled: v })} />
        <ToggleRow label="Share" checked={ui.shareEnabled !== false} onChange={(v) => set({ shareEnabled: v })} hint="No public share affordance built yet" />
      </GroupCard>
    </div>
  );
}
