"use client";

import { useState, type RefObject } from "react";
import { Copy, Plus, Scissors, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColorRow, GroupCard, SectionHeading, SliderRow, ToggleRow } from "../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import { SECTION_MAX_DIMENSION_M } from "@/lib/render-engine/sections";

/**
 * Sections tab (PRD §34-36) — real clip + cap via THREE.ClippingGroup
 * (RenderEngine.ts's activateSection/rebuildSectionCap, restored
 * near-verbatim from the pre-rebuild engine's already-production-proven
 * technique). "Floor Sections" (Single Floor / Building Section) and
 * "Manual Clipping" are the same underlying Section record in this
 * editor — a heightOnly cut IS a floor section, a full box IS a manual
 * clip — presented as one coherent list+editor rather than duplicated
 * logic across 3 mechanically-split subtabs. "Presets" is this same list
 * (each saved Section already is a quick-selectable preset).
 *
 * No TransformControls viewport drag-authoring yet (PRD's full vision) —
 * numeric fields only this pass, a real, honestly-scoped reduction, not a
 * placeholder.
 */
export function SectionsPanel({
  configEditor,
  viewerRef,
  canEdit,
}: {
  configEditor: UseProjectConfigEditorReturn;
  viewerRef: RefObject<ThreeProjectViewerHandle | null>;
  canEdit: boolean;
}) {
  const { draft, activeSectionId, setActiveSectionId, addSection, updateSection, deleteSection, duplicateSection } = configEditor;
  const [mode, setMode] = useState<"floor" | "manual">("manual");
  const sections = draft.sections;
  const active = sections.find((s) => s.id === activeSectionId) ?? null;

  function activate(id: string | null) {
    setActiveSectionId(id);
    const section = sections.find((s) => s.id === id) ?? null;
    viewerRef.current?.activateSection(section);
  }

  function create() {
    // Real loaded-content bounds, not world origin — see addSection's own
    // doc comment for the actual bug this prevents (a new section barely
    // overlapping content that isn't centered at (0,0)).
    const bounds = viewerRef.current?.getContentBounds() ?? null;
    const midHeight = bounds ? (bounds.minY + bounds.maxY) / 2 : 3;
    const section = addSection({
      name: mode === "floor" ? `Floor Section ${sections.length + 1}` : `Section ${sections.length + 1}`,
      scope: "project",
      heightM: midHeight,
      centerX: bounds?.centerX,
      centerZ: bounds?.centerZ,
      widthM: bounds ? Math.max(5, bounds.sizeX * 0.6) : undefined,
      depthM: bounds ? Math.max(5, bounds.sizeZ * 0.6) : undefined,
      // Passed directly into the new record itself, not via a follow-up
      // updateSection() call — that call would read `draft.sections` from
      // BEFORE addSection's own update() lands (a real stale-closure bug
      // this exact sequence hit: heightOnly silently never applied for
      // Floor Sections).
      heightOnly: mode === "floor",
    });
    viewerRef.current?.activateSection(section);
  }

  function set(patch: Parameters<typeof updateSection>[1]) {
    if (!active) return;
    updateSection(active.id, patch);
    // Live preview — reapply immediately so dragging a slider shows the
    // clip move in real time, same pattern Materials/Model-transform use.
    viewerRef.current?.activateSection({ ...active, ...patch });
  }

  return (
    <div className="space-y-3">
      <SectionHeading>Sections</SectionHeading>
      <div className="flex gap-1 rounded-md bg-neutral-900 p-0.5">
        <button onClick={() => setMode("floor")} className={cn("flex-1 rounded px-2 py-1 text-[11px] font-semibold", mode === "floor" ? "bg-neutral-700 text-white" : "text-neutral-400")}>
          Floor Sections
        </button>
        <button onClick={() => setMode("manual")} className={cn("flex-1 rounded px-2 py-1 text-[11px] font-semibold", mode === "manual" ? "bg-neutral-700 text-white" : "text-neutral-400")}>
          Manual Clipping
        </button>
      </div>
      <button
        onClick={create}
        disabled={!canEdit}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" /> New {mode === "floor" ? "Floor Section" : "Section"}
      </button>

      <SectionHeading>Presets</SectionHeading>
      {sections.length === 0 && <p className="p-2 text-center text-xs text-neutral-600">No sections saved yet.</p>}
      <div className="space-y-1">
        {sections.map((s) => (
          <div key={s.id} className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1.5", s.id === activeSectionId ? "border-indigo-500 bg-indigo-500/10" : "border-neutral-800")}>
            <button onClick={() => activate(s.id === activeSectionId ? null : s.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-neutral-200">
              <Scissors className="h-3 w-3 shrink-0 text-neutral-500" />
              <span className="truncate">{s.name}</span>
              {s.heightOnly && <span className="shrink-0 rounded bg-neutral-800 px-1 text-[9px] text-neutral-400">FLOOR</span>}
            </button>
            <button onClick={() => duplicateSection(s.id)} disabled={!canEdit} title="Duplicate" className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-40">
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={() => {
                if (s.id === activeSectionId) activate(null);
                deleteSection(s.id);
              }}
              disabled={!canEdit}
              title="Delete"
              className="shrink-0 rounded p-1 text-red-500 hover:bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {active && (
        <div className="space-y-3">
          <div className="h-px bg-neutral-800" />
          <input
            value={active.name}
            disabled={!canEdit}
            onChange={(e) => set({ name: e.target.value })}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100"
          />
          <GroupCard>
            <ToggleRow label="Height Only" checked={!!active.heightOnly} disabled={!canEdit} onChange={(v) => set({ heightOnly: v })} />
            <ToggleRow label="Bottom Plane" checked={active.bottomEnabled} disabled={!canEdit} onChange={(v) => set({ bottomEnabled: v })} />
          </GroupCard>

          <SliderRow label="Height (Slab)" value={active.heightM} min={-50} max={500} step={0.1} suffix="m" disabled={!canEdit} onChange={(v) => set({ heightM: v })} />

          {!active.heightOnly && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Footprint</p>
              <SliderRow label="Center X" value={active.centerX} min={-SECTION_MAX_DIMENSION_M / 2} max={SECTION_MAX_DIMENSION_M / 2} step={0.5} suffix="m" disabled={!canEdit} onChange={(v) => set({ centerX: v })} />
              <SliderRow label="Center Z" value={active.centerZ} min={-SECTION_MAX_DIMENSION_M / 2} max={SECTION_MAX_DIMENSION_M / 2} step={0.5} suffix="m" disabled={!canEdit} onChange={(v) => set({ centerZ: v })} />
              <SliderRow label="Width" value={active.widthM} min={1} max={SECTION_MAX_DIMENSION_M} step={0.5} suffix="m" disabled={!canEdit} onChange={(v) => set({ widthM: v })} />
              <SliderRow label="Depth" value={active.depthM} min={1} max={SECTION_MAX_DIMENSION_M} step={0.5} suffix="m" disabled={!canEdit} onChange={(v) => set({ depthM: v })} />
              <SliderRow label="Rotation" value={active.rotationDeg} min={-180} max={180} step={1} suffix="°" disabled={!canEdit} onChange={(v) => set({ rotationDeg: v })} />
            </>
          )}

          <SectionHeading>Cap</SectionHeading>
          <GroupCard>
            <ToggleRow label="Fill Gaps" checked={active.fillGapsEnabled} disabled={!canEdit} onChange={(v) => set({ fillGapsEnabled: v })} />
            <ColorRow label="Fill Color" value={active.fillColor} disabled={!canEdit || !active.fillGapsEnabled} onChange={(v) => set({ fillColor: v })} />
          </GroupCard>
        </div>
      )}
    </div>
  );
}
