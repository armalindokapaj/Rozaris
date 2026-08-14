"use client";

import type { Project3DConfig } from "@/lib/types";
import { ToggleField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";

/**
 * Viewer mode panel — moved verbatim from Project3DConfigEditor.tsx's
 * "Viewer UI" section (1019-1047).
 */
export function ViewerPanel({
  draft,
  update,
  t,
}: {
  draft: Project3DConfig;
  update: (partial: Partial<Project3DConfig>, opts?: SetOpts) => void;
  t: Translate;
}) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
        {t("admin.sceneViewerUITitle")}
      </h3>
      <div className="space-y-3">
        <ToggleField
          label={t("project.home")}
          checked={draft.viewerUI.home}
          onChange={(v) => update({ viewerUI: { ...draft.viewerUI, home: v } }, { commit: true })}
        />
        <ToggleField
          label={t("unit.viewerUnitSearch")}
          checked={draft.viewerUI.unitSearch}
          onChange={(v) => update({ viewerUI: { ...draft.viewerUI, unitSearch: v } }, { commit: true })}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-400">{t("admin.sceneViewerUINote")}</p>

      {/* Interaction toggles (full-configurator pass) — previously 100%
          hardcoded runtime behavior in RenderEngine.ts/ArchVizClient.tsx
          with no admin control at all. Missing keys on pre-existing config
          rows default to `true` client-side (today's always-on behavior),
          same nullable-Json?-column pattern as the 4 toggles above. */}
      <h3 className="mb-2.5 mt-6 text-xs font-bold uppercase tracking-wide text-neutral-500">
        {t("admin.sceneInteractionTitle")}
      </h3>
      <div className="space-y-3">
        <ToggleField
          label={t("admin.interactionHover")}
          checked={draft.viewerUI.hoverEnabled ?? true}
          onChange={(v) => update({ viewerUI: { ...draft.viewerUI, hoverEnabled: v } }, { commit: true })}
        />
        <ToggleField
          label={t("admin.interactionSelect")}
          checked={draft.viewerUI.selectEnabled ?? true}
          onChange={(v) => update({ viewerUI: { ...draft.viewerUI, selectEnabled: v } }, { commit: true })}
        />
        <ToggleField
          label={t("admin.interactionShowUnitInfo")}
          checked={draft.viewerUI.showUnitInfo ?? true}
          onChange={(v) => update({ viewerUI: { ...draft.viewerUI, showUnitInfo: v } }, { commit: true })}
        />
        {/* Sections module — same optional/defaults-true pattern as the 3
            toggles above. Only meaningful once at least one non-hidden
            section exists (ProceduralProjectViewer.tsx's own menu-button
            gate) — this just lets Admin turn the public entry point off
            entirely regardless. */}
        <ToggleField
          label={t("admin.interactionShowSections")}
          checked={draft.viewerUI.sectionsEnabled ?? true}
          onChange={(v) => update({ viewerUI: { ...draft.viewerUI, sectionsEnabled: v } }, { commit: true })}
        />
        {/* "Sun Orientation" bottom-menu button — 5 fixed presets, real
            client-side override on top of the Sky tab's own authored sun.
            Same optional/defaults-true toggle pattern as the 4 above. */}
        <ToggleField
          label={t("admin.interactionShowSunPresets")}
          checked={draft.viewerUI.sunPresetEnabled ?? true}
          onChange={(v) => update({ viewerUI: { ...draft.viewerUI, sunPresetEnabled: v } }, { commit: true })}
        />
      </div>
    </section>
  );
}
