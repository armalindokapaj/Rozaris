"use client";

import { Move, RotateCw, Ruler, ArrowUpDown, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuildingGroup } from "@/lib/units";
import type { Section } from "@/lib/types";
import type { SectionGizmoMode } from "@/components/project/viewerTypes";
import { ColorField, SelectField, SliderField, TextField, ToggleField } from "../fields";
import type { Translate } from "../editorTypes";

const GIZMO_MODES: [SectionGizmoMode, typeof Move, string][] = [
  ["move", Move, "admin.sectionModeMove"],
  ["rotate", RotateCw, "admin.sectionModeRotate"],
  ["resize", Ruler, "admin.sectionModeResize"],
  ["height", ArrowUpDown, "admin.sectionModeHeight"],
];

/**
 * Sections tab's right-panel settings form (first-class Configurator
 * module, 2026-08-13) — every field is two-way bound to the live gizmo:
 * dragging a handle in the viewport updates these numbers (via
 * `RenderEngineCallbacks.onSectionDraftChange`, threaded down as `section`
 * by `EditorShell`), and editing a number here moves the gizmo the same
 * way (`EditorShell`'s `update` re-syncs `attachSectionGizmo`). Camera/
 * Cut-Style/Floor fields are the "settings" a gizmo drag can't express.
 */
export function SectionsPanel({
  section,
  update,
  gizmoMode,
  setGizmoMode,
  floorGroups,
  onSetCamera,
  cameraSaved,
  t,
}: {
  section: Section;
  update: (partial: Partial<Section>) => void;
  gizmoMode: SectionGizmoMode;
  setGizmoMode: (mode: SectionGizmoMode) => void;
  floorGroups: BuildingGroup[];
  onSetCamera: () => void;
  cameraSaved: boolean;
  t: Translate;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sectionsListTitle")}
        </h3>
        {/* Move / Rotate / Resize / Height — real TransformControls modes,
            not 4 bespoke gizmos (see RenderEngine.ts's setSectionGizmoMode
            doc comment). */}
        <div className="mb-4 grid grid-cols-4 gap-1 rounded-control border border-neutral-200 p-1">
          {GIZMO_MODES.map(([mode, Icon, labelKey]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGizmoMode(mode)}
              title={t(labelKey)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-control py-2 text-[10px] font-semibold",
                gizmoMode === mode ? "bg-brand-500 text-white" : "text-neutral-600 hover:bg-neutral-100"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(labelKey)}
            </button>
          ))}
        </div>

        <fieldset className="space-y-3">
          <TextField label={t("admin.sectionName")} value={section.name} onChange={(v) => update({ name: v })} />

          <SelectField
            label={t("admin.sectionScope")}
            value={section.scope}
            onChange={(v) => update({ scope: v as Section["scope"] })}
            options={[
              ["project", t("admin.sectionScopeProject")],
              ["building", t("admin.sectionScopeBuilding")],
            ]}
          />

          <SliderField
            label={t("admin.sectionCutHeight")}
            min={-5}
            max={100}
            step={0.1}
            value={section.heightM}
            onChange={(v) => update({ heightM: v })}
            suffix="m"
          />
          <SliderField
            label={t("admin.sectionWidth")}
            min={1}
            max={200}
            step={0.5}
            value={section.widthM}
            onChange={(v) => update({ widthM: v })}
            suffix="m"
          />
          <SliderField
            label={t("admin.sectionDepth")}
            min={1}
            max={200}
            step={0.5}
            value={section.depthM}
            onChange={(v) => update({ depthM: v })}
            suffix="m"
          />
          <SliderField
            label={t("admin.sectionRotation")}
            min={-180}
            max={180}
            step={1}
            value={Math.round(section.rotationDeg)}
            onChange={(v) => update({ rotationDeg: v })}
            suffix="°"
          />
          <ToggleField
            label={t("admin.sectionBottomClip")}
            checked={section.bottomEnabled}
            onChange={(v) => update({ bottomEnabled: v })}
          />
        </fieldset>
      </section>

      <section className="border-t border-neutral-100 pt-5">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sectionFillGapsTitle")}
        </h3>
        <fieldset className="space-y-3">
          <ToggleField
            label={t("admin.sectionFillGapsEnabled")}
            checked={section.fillGapsEnabled}
            onChange={(v) => update({ fillGapsEnabled: v })}
          />
          <p className="text-[11px] text-neutral-400">{t("admin.sectionFillGapsNote")}</p>
          <ColorField
            label={t("admin.sectionFillColor")}
            value={section.fillColor}
            onChange={(v) => update({ fillColor: v })}
          />
        </fieldset>
      </section>

      <section className="border-t border-neutral-100 pt-5">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sectionAssignFloor")}
        </h3>
        <fieldset className="space-y-3">
          <SelectField
            label={t("admin.sectionAssignFloor")}
            value={section.floorId ?? ""}
            onChange={(v) => update({ floorId: v || undefined })}
            options={[
              ["", t("admin.detailModelUnlinked")],
              ...floorGroups.flatMap((b) =>
                b.floors.map((f): [string, string] => [f.floorId, `${b.name} · ${t("admin.detailModelFloorLabel", { floor: f.floor })}`])
              ),
            ]}
          />
        </fieldset>
      </section>

      <section className="border-t border-neutral-100 pt-5">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sectionSetCamera")}
        </h3>
        <button
          type="button"
          onClick={onSetCamera}
          className="flex w-full items-center justify-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          <Camera className="h-3.5 w-3.5" />
          {t("admin.sectionSetCamera")}
        </button>
        {cameraSaved && (
          <p className="mt-2 rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
            {t("admin.sectionCameraSaved")}
          </p>
        )}
        {section.cameraPreset && (
          <p className="mt-1.5 text-[11px] text-neutral-400">{t("admin.sectionCameraSet")}</p>
        )}
      </section>
    </div>
  );
}
