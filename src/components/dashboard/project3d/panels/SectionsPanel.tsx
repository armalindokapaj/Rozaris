"use client";

import { Move, RotateCw, Ruler, ArrowUpDown, Camera, Save, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuildingGroup } from "@/lib/units";
import type { Section } from "@/lib/types";
import type { SectionGizmoMode } from "@/components/project/viewerTypes";
import { ColorField, SelectField, SliderField, TextField, ToggleField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";

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
  onSave,
  saveBusy,
  savedFlash,
  saveError,
  t,
}: {
  section: Section;
  update: (partial: Partial<Section>, opts?: SetOpts) => void;
  gizmoMode: SectionGizmoMode;
  setGizmoMode: (mode: SectionGizmoMode) => void;
  floorGroups: BuildingGroup[];
  onSetCamera: () => void;
  cameraSaved: boolean;
  /** Real explicit save — the same PATCH `/api/project-3d-config/[id]`
   * every other tab already relies on (via autosave or the header's "Save
   * Draft"), just given a dedicated, visible button here too: field edits
   * always apply live/locally the moment you make them (see `update`
   * above), autosave picks them up ~1.8s after you stop typing either
   * way — this button only makes that save immediate and its result
   * visible, it isn't a second/different save path. */
  onSave: () => void;
  saveBusy: boolean;
  savedFlash: boolean;
  saveError: string | null;
  t: Translate;
}) {
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            {t("admin.sectionsListTitle")}
          </h3>
          <button
            type="button"
            onClick={onSave}
            disabled={saveBusy}
            className="flex shrink-0 items-center gap-1.5 rounded-control bg-brand-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {savedFlash ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
            {saveBusy ? t("admin.sectionSaving") : savedFlash ? t("admin.sectionSaved") : t("admin.sectionSave")}
          </button>
        </div>
        {saveError && <p className="mb-2.5 text-[11px] text-red-600">{saveError}</p>}
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
          {/* Continuous fields (typing, dragging) pass `commit: false` —
              useUndoRedo coalesces a burst into one undo step ~500ms after
              it goes quiet, matching every other panel's slider convention
              (see useProject3DEditorState.ts). Previously these omitted
              opts entirely, which — combined with handleUpdateSection
              unconditionally forcing `commit: true` — meant every single
              keystroke/drag-tick became its own undo step AND its own full
              live-preview rebuild; fixed alongside the debounce added in
              EditorShell.tsx's syncSectionGizmo. */}
          <TextField
            label={t("admin.sectionName")}
            value={section.name}
            onChange={(v) => update({ name: v }, { commit: false })}
          />

          <SelectField
            label={t("admin.sectionScope")}
            value={section.scope}
            onChange={(v) => update({ scope: v as Section["scope"] }, { commit: true })}
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
            onChange={(v) => update({ heightM: v }, { commit: false })}
            suffix="m"
          />
          <SliderField
            label={t("admin.sectionWidth")}
            min={1}
            max={200}
            step={0.5}
            value={section.widthM}
            onChange={(v) => update({ widthM: v }, { commit: false })}
            suffix="m"
          />
          <SliderField
            label={t("admin.sectionDepth")}
            min={1}
            max={200}
            step={0.5}
            value={section.depthM}
            onChange={(v) => update({ depthM: v }, { commit: false })}
            suffix="m"
          />
          <SliderField
            label={t("admin.sectionRotation")}
            min={-180}
            max={180}
            step={1}
            value={Math.round(section.rotationDeg)}
            onChange={(v) => update({ rotationDeg: v }, { commit: false })}
            suffix="°"
          />
          <ToggleField
            label={t("admin.sectionBottomClip")}
            checked={section.bottomEnabled}
            onChange={(v) => update({ bottomEnabled: v }, { commit: true })}
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
            onChange={(v) => update({ fillGapsEnabled: v }, { commit: true })}
          />
          <p className="text-[11px] text-neutral-400">{t("admin.sectionFillGapsNote")}</p>
          <ColorField
            label={t("admin.sectionFillColor")}
            value={section.fillColor}
            onChange={(v) => update({ fillColor: v }, { commit: true })}
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
            onChange={(v) => update({ floorId: v || undefined }, { commit: true })}
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
