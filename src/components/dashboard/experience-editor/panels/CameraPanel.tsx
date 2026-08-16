"use client";

import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

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
export function CameraPanel({ configEditor, canEdit }: { configEditor: UseProjectConfigEditorReturn; canEdit: boolean }) {
  const { draft, update } = configEditor;
  const disabled = !canEdit;
  const focalLength = fovToFocalLength(draft.cameraFovDesktop, draft.cameraSensorWidthMm);

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
    </div>
  );
}
