"use client";

import { RotateCcw, Ruler } from "lucide-react";
import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../fields";
import type { UseModelEditorReturn } from "@/hooks/useModelEditor";

/**
 * Scene tab → Model (PRD §5). Position/Rotation/Scale/Ground alignment/
 * Reset Transform, plus the Model switches. Model/Visibility are real and
 * live (skip loading vs. hide); Cast Shadow/Receive Shadow are stored and
 * applied to mesh flags now but have no visible effect until a shadow-
 * casting light exists (Phase 3); Selectable/Transform Lock are stored
 * but inert until a viewport click-select/gizmo system exists — all
 * three are shown disabled with an honest "lands in Phase N" hint rather
 * than pretending to do something today.
 */
export function ModelPanel({
  modelEditor,
  canEdit,
  onGroundAlign,
}: {
  modelEditor: UseModelEditorReturn;
  canEdit: boolean;
  onGroundAlign: () => void;
}) {
  const { transform, switches, updateTransform, updateSwitches, resetTransform } = modelEditor;
  const disabled = !canEdit;

  return (
    <div className="space-y-3">
      <SectionHeading>Model</SectionHeading>
      <GroupCard>
        <ToggleRow label="Model" checked={switches.modelEnabled} disabled={disabled} onChange={(v) => updateSwitches({ modelEnabled: v })} />
        <ToggleRow label="Visibility" checked={switches.modelVisible} disabled={disabled} onChange={(v) => updateSwitches({ modelVisible: v })} />
        <ToggleRow
          label="Cast Shadow"
          checked={switches.castShadow}
          disabled={disabled}
          hint="Lands in Phase 3 (Lighting → Shadows) — stored now, no shadow-casting light exists yet"
          onChange={(v) => updateSwitches({ castShadow: v })}
        />
        <ToggleRow
          label="Receive Shadow"
          checked={switches.receiveShadow}
          disabled={disabled}
          hint="Lands in Phase 3 (Lighting → Shadows)"
          onChange={(v) => updateSwitches({ receiveShadow: v })}
        />
        <ToggleRow
          label="Selectable"
          checked={switches.selectable}
          disabled={disabled}
          hint="Lands with viewport click-select (Interaction phase)"
          onChange={(v) => updateSwitches({ selectable: v })}
        />
        <ToggleRow
          label="Transform Lock"
          checked={switches.transformLocked}
          disabled={disabled}
          hint="Lands with the viewport transform gizmo"
          onChange={(v) => updateSwitches({ transformLocked: v })}
        />
      </GroupCard>

      <SectionHeading>Transform</SectionHeading>
      <GroupCard>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Position</p>
        <SliderRow label="X" value={transform.positionX} min={-500} max={500} step={0.5} suffix="m" disabled={disabled} onChange={(v) => updateTransform({ positionX: v })} />
        <SliderRow label="Y" value={transform.altitudeOffset} min={-500} max={500} step={0.5} suffix="m" disabled={disabled} onChange={(v) => updateTransform({ altitudeOffset: v })} />
        <SliderRow label="Z" value={transform.positionZ} min={-500} max={500} step={0.5} suffix="m" disabled={disabled} onChange={(v) => updateTransform({ positionZ: v })} />
      </GroupCard>
      <GroupCard>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Rotation</p>
        <SliderRow label="X" value={transform.rotationXDeg} min={-180} max={180} step={1} suffix="°" disabled={disabled} onChange={(v) => updateTransform({ rotationXDeg: v })} />
        <SliderRow label="Y" value={transform.rotationDeg} min={0} max={359} step={1} suffix="°" disabled={disabled} onChange={(v) => updateTransform({ rotationDeg: v })} />
        <SliderRow label="Z" value={transform.rotationZDeg} min={-180} max={180} step={1} suffix="°" disabled={disabled} onChange={(v) => updateTransform({ rotationZDeg: v })} />
      </GroupCard>
      <GroupCard>
        <SliderRow label="Scale" value={transform.scale} min={0.01} max={20} step={0.01} suffix="×" disabled={disabled} onChange={(v) => updateTransform({ scale: v })} />
      </GroupCard>

      <div className="flex gap-2">
        <button
          onClick={onGroundAlign}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Ruler className="h-3.5 w-3.5" /> Ground Align
        </button>
        <button
          onClick={resetTransform}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset Transform
        </button>
      </div>
    </div>
  );
}
