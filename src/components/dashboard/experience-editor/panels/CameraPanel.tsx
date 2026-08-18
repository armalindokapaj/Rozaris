"use client";

import { useState, type RefObject } from "react";
import { Play, RotateCcw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { GroupCard, SectionHeading, SelectRow, SliderRow, ToggleRow } from "../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";

/** Idle Drone Camera PRD §8 — "Reset Drone Settings" restores exactly
 * these 13 persisted fields (phaseOffsetDeg included for completeness even
 * though it has no slider of its own — see Project3DConfig's own doc
 * comment in src/lib/types.ts). */
const IDLE_DRONE_DEFAULTS = {
  idleDroneEnabled: true,
  idleDroneDelaySec: 60,
  idleDroneOrbitDurationSec: 80,
  idleDroneClockwise: true,
  idleDroneMotionEnabled: true,
  idleDroneHeightEnabled: true,
  idleDroneHeightAmplitude: 0.18,
  idleDroneDistanceEnabled: true,
  idleDroneDistanceAmplitude: 0.05,
  idleDroneTargetEnabled: true,
  idleDroneTargetAmplitude: 0.06,
  idleDroneVerticalCycles: 2,
  idleDronePhaseOffsetDeg: 0,
  idleDroneSmoothness: 0.88,
};

/** Converts FOV (vertical, degrees) + sensor width to an approximate
 * 35mm-equivalent focal length (mm) — standard cinematography formula,
 * assuming the sensor height implied by a 3:2 aspect (36×24mm full-frame
 * convention) since this editor's FOV is vertical, not horizontal. */
function fovToFocalLength(fovDeg: number, sensorWidthMm: number): number {
  const sensorHeightMm = (sensorWidthMm * 2) / 3;
  return sensorHeightMm / 2 / Math.tan((fovDeg * Math.PI) / 360);
}
function focalLengthToFov(focalLengthMm: number, sensorWidthMm: number): number {
  const sensorHeightMm = (sensorWidthMm * 2) / 3;
  return (360 / Math.PI) * Math.atan(sensorHeightMm / 2 / focalLengthMm);
}

/** Camera tab (PRD §37) — owns camera properties, not Shots. Built almost
 * entirely on pre-existing Project3DConfig fields (cameraFovDesktop/
 * Mobile, cameraStart/Min/MaxDistanceMultiplier, cameraMin/MaxPolarDeg,
 * autoRotate) plus a small Phase-A addition (near/far clip, azimuth
 * limits, pan/zoom/damping/orbit/auto-focus/helper toggles, sensor
 * width) — see the config editor's own doc comment. */
export function CameraPanel({
  configEditor,
  canEdit,
  viewerRef,
}: {
  configEditor: UseProjectConfigEditorReturn;
  canEdit: boolean;
  viewerRef: RefObject<ThreeProjectViewerHandle | null>;
}) {
  const { draft, update } = configEditor;
  const disabled = !canEdit;
  const focalLength = fovToFocalLength(draft.cameraFovDesktop, draft.cameraSensorWidthMm);
  const [previewing, setPreviewing] = useState(false);
  const [showPath, setShowPath] = useState(false);
  const motionDisabled = disabled || !draft.idleDroneMotionEnabled;

  function togglePreview() {
    if (previewing) viewerRef.current?.stopIdleDronePreview();
    else viewerRef.current?.previewIdleDrone();
    setPreviewing((v) => !v);
  }

  function toggleShowPath(v: boolean) {
    setShowPath(v);
    viewerRef.current?.setShowDronePath(v);
  }

  return (
    <div className="space-y-3">
      <SectionHeading>Camera</SectionHeading>
      <GroupCard>
        <ToggleRow label="Orbit" checked={draft.cameraOrbitEnabled} disabled={disabled} onChange={(v) => update({ cameraOrbitEnabled: v })} />
        <ToggleRow label="Pan" checked={draft.cameraPanEnabled} disabled={disabled} onChange={(v) => update({ cameraPanEnabled: v })} />
        <ToggleRow label="Zoom" checked={draft.cameraZoomEnabled} disabled={disabled} onChange={(v) => update({ cameraZoomEnabled: v })} />
        <ToggleRow label="Damping" checked={draft.cameraDampingEnabled} disabled={disabled} onChange={(v) => update({ cameraDampingEnabled: v })} />
        <ToggleRow label="Auto Rotate" checked={draft.autoRotate} disabled={disabled} onChange={(v) => update({ autoRotate: v })} />
        <ToggleRow
          label="Auto Focus"
          checked={draft.cameraAutoFocusEnabled}
          disabled={disabled}
          hint="Lands with Depth of Field (Rendering tab, later phase)"
          onChange={(v) => update({ cameraAutoFocusEnabled: v })}
        />
        <ToggleRow label="Camera Helper" checked={draft.cameraHelperEnabled} disabled={disabled} onChange={(v) => update({ cameraHelperEnabled: v })} />
      </GroupCard>

      <SectionHeading>Lens</SectionHeading>
      <GroupCard>
        <SliderRow label="FOV (desktop)" value={draft.cameraFovDesktop} min={10} max={120} step={1} suffix="°" disabled={disabled} onChange={(v) => update({ cameraFovDesktop: v })} />
        <SliderRow label="FOV (mobile)" value={draft.cameraFovMobile} min={10} max={120} step={1} suffix="°" disabled={disabled} onChange={(v) => update({ cameraFovMobile: v })} />
        <SliderRow
          label="Focal Length"
          value={Math.round(focalLength)}
          min={8}
          max={300}
          step={1}
          suffix="mm"
          disabled={disabled}
          onChange={(v) => update({ cameraFovDesktop: Math.round(focalLengthToFov(v, draft.cameraSensorWidthMm) * 10) / 10 })}
        />
        <SliderRow label="Sensor / Film Gate" value={draft.cameraSensorWidthMm} min={10} max={70} step={1} suffix="mm" disabled={disabled} onChange={(v) => update({ cameraSensorWidthMm: v })} />
      </GroupCard>

      <SectionHeading>Clip Planes</SectionHeading>
      <GroupCard>
        <SliderRow label="Near Clip" value={draft.cameraNearClip} min={0.01} max={10} step={0.01} suffix="m" disabled={disabled} onChange={(v) => update({ cameraNearClip: v })} />
        <SliderRow label="Far Clip" value={draft.cameraFarClip} min={100} max={20000} step={50} suffix="m" disabled={disabled} onChange={(v) => update({ cameraFarClip: v })} />
      </GroupCard>

      <SectionHeading>Distance Limits</SectionHeading>
      <GroupCard>
        <SliderRow label="Start Distance" value={draft.cameraStartDistanceMultiplier} min={0.1} max={10} step={0.1} suffix="×" disabled={disabled} onChange={(v) => update({ cameraStartDistanceMultiplier: v })} />
        <SliderRow label="Min Distance" value={draft.cameraMinDistanceMultiplier} min={0.05} max={10} step={0.05} suffix="×" disabled={disabled} onChange={(v) => update({ cameraMinDistanceMultiplier: v })} />
        <SliderRow label="Max Distance" value={draft.cameraMaxDistanceMultiplier} min={0.5} max={20} step={0.1} suffix="×" disabled={disabled} onChange={(v) => update({ cameraMaxDistanceMultiplier: v })} />
      </GroupCard>

      <SectionHeading>Angle Limits</SectionHeading>
      <GroupCard>
        <SliderRow label="Min Polar" value={draft.cameraMinPolarDeg} min={0} max={180} step={1} suffix="°" disabled={disabled} onChange={(v) => update({ cameraMinPolarDeg: v })} />
        <SliderRow label="Max Polar" value={draft.cameraMaxPolarDeg} min={0} max={180} step={1} suffix="°" disabled={disabled} onChange={(v) => update({ cameraMaxPolarDeg: v })} />
        <ToggleRow
          label="Restrict Azimuth"
          checked={draft.cameraMinAzimuthDeg != null}
          disabled={disabled}
          onChange={(v) => update(v ? { cameraMinAzimuthDeg: -90, cameraMaxAzimuthDeg: 90 } : { cameraMinAzimuthDeg: null, cameraMaxAzimuthDeg: null })}
        />
        {draft.cameraMinAzimuthDeg != null && (
          <>
            <SliderRow label="Min Azimuth" value={draft.cameraMinAzimuthDeg} min={-180} max={180} step={1} suffix="°" disabled={disabled} onChange={(v) => update({ cameraMinAzimuthDeg: v })} />
            <SliderRow label="Max Azimuth" value={draft.cameraMaxAzimuthDeg ?? 90} min={-180} max={180} step={1} suffix="°" disabled={disabled} onChange={(v) => update({ cameraMaxAzimuthDeg: v })} />
          </>
        )}
      </GroupCard>

      <SectionHeading>Idle Drone Camera</SectionHeading>
      <GroupCard>
        <ToggleRow label="Idle Drone Camera" checked={draft.idleDroneEnabled} disabled={disabled} onChange={(v) => update({ idleDroneEnabled: v })} />
        <SliderRow
          label="Start After"
          value={draft.idleDroneDelaySec}
          min={5}
          max={600}
          step={1}
          suffix="s"
          disabled={disabled || !draft.idleDroneEnabled}
          onChange={(v) => update({ idleDroneDelaySec: v })}
        />
        <SliderRow
          label="Orbit Duration"
          value={draft.idleDroneOrbitDurationSec}
          min={20}
          max={300}
          step={1}
          suffix="s"
          disabled={disabled || !draft.idleDroneEnabled}
          onChange={(v) => update({ idleDroneOrbitDurationSec: v })}
        />
        <SelectRow
          label="Direction"
          value={draft.idleDroneClockwise ? "cw" : "ccw"}
          disabled={disabled || !draft.idleDroneEnabled}
          options={[
            { value: "cw", label: "Clockwise" },
            { value: "ccw", label: "Counterclockwise" },
          ]}
          onChange={(v) => update({ idleDroneClockwise: v === "cw" })}
        />
      </GroupCard>

      <SectionHeading>Drone Motion</SectionHeading>
      <GroupCard>
        <ToggleRow label="Drone Motion" checked={draft.idleDroneMotionEnabled} disabled={disabled || !draft.idleDroneEnabled} onChange={(v) => update({ idleDroneMotionEnabled: v })} />
        <ToggleRow label="Vertical Movement" checked={draft.idleDroneHeightEnabled} disabled={motionDisabled} onChange={(v) => update({ idleDroneHeightEnabled: v })} />
        <SliderRow label="Amount" value={draft.idleDroneHeightAmplitude} min={0} max={0.5} step={0.01} disabled={motionDisabled} onChange={(v) => update({ idleDroneHeightAmplitude: v })} />
        <SliderRow
          label="Vertical Cycles"
          value={draft.idleDroneVerticalCycles}
          min={1}
          max={4}
          step={1}
          disabled={motionDisabled}
          onChange={(v) => update({ idleDroneVerticalCycles: v })}
        />
        <ToggleRow label="Distance Movement" checked={draft.idleDroneDistanceEnabled} disabled={motionDisabled} onChange={(v) => update({ idleDroneDistanceEnabled: v })} />
        <SliderRow label="Amount" value={draft.idleDroneDistanceAmplitude} min={0} max={0.25} step={0.01} disabled={motionDisabled} onChange={(v) => update({ idleDroneDistanceAmplitude: v })} />
        <ToggleRow label="Target Movement" checked={draft.idleDroneTargetEnabled} disabled={motionDisabled} onChange={(v) => update({ idleDroneTargetEnabled: v })} />
        <SliderRow label="Amount" value={draft.idleDroneTargetAmplitude} min={0} max={0.25} step={0.01} disabled={motionDisabled} onChange={(v) => update({ idleDroneTargetAmplitude: v })} />
        <SliderRow
          label="Smoothness"
          value={draft.idleDroneSmoothness}
          min={0}
          max={1}
          step={0.01}
          disabled={disabled || !draft.idleDroneEnabled}
          onChange={(v) => update({ idleDroneSmoothness: v })}
        />
      </GroupCard>

      <SectionHeading>Editor Tools</SectionHeading>
      <GroupCard>
        <button
          onClick={togglePreview}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-neutral-800",
            previewing ? "text-indigo-400" : "text-neutral-300"
          )}
        >
          {previewing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {previewing ? "Stop Preview" : "Preview Drone"}
        </button>
        <ToggleRow label="Show Drone Path" checked={showPath} onChange={toggleShowPath} />
        <button
          onClick={() => update(IDLE_DRONE_DEFAULTS)}
          disabled={disabled}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset Drone Settings
        </button>
      </GroupCard>
    </div>
  );
}
