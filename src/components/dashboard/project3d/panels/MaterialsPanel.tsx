"use client";

import type { Project3DConfig } from "@/lib/types";
import { SelectField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";

/**
 * Materials mode panel — moved verbatim from Project3DConfigEditor.tsx's
 * "Glass" section (869-885). Per-node classification/material-preset
 * override lives in the persistent SceneTreeRail (shown alongside this
 * panel on the Materials tab), not duplicated here.
 */
export function MaterialsPanel({
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
        {t("admin.sceneGlassTitle")}
      </h3>
      <SelectField
        label={t("admin.sceneGlassPreset")}
        value={draft.glassPreset}
        onChange={(v) => update({ glassPreset: v as Project3DConfig["glassPreset"] }, { commit: true })}
        options={[
          ["performance", t("admin.sceneGlassPerformance")],
          ["standard", t("admin.sceneGlassStandard")],
          ["premium", t("admin.sceneGlassPremium")],
        ]}
      />
      <p className="mt-1.5 text-[11px] text-neutral-400">{t("admin.sceneGlassNote")}</p>
    </section>
  );
}
