"use client";

import { useState, type RefObject } from "react";
import { Camera, ChevronDown, ChevronUp, Copy, Play, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GroupCard, SectionHeading, SliderRow } from "../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import type { CameraPreset } from "@/lib/types";

export function ShotsPanel({
  configEditor,
  canEdit,
  viewerRef,
}: {
  configEditor: UseProjectConfigEditorReturn;
  canEdit: boolean;
  viewerRef: RefObject<ThreeProjectViewerHandle | null>;
}) {
  const { draft, addShot, renameShot, duplicateShot, deleteShot, reorderShot, setOpeningShot } = configEditor;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const shots = draft.cameraPresets;

  function capture() {
    const state = viewerRef.current?.getCameraState();
    if (!state) return;
    const preset: CameraPreset = {
      id: `shot-${Date.now()}`,
      label: `Shot ${shots.length + 1}`,
      position: state.position,
      target: state.target,
      fov: state.fov,
      durationMs: 1500,
    };
    addShot(preset);
  }

  function preview(shot: CameraPreset) {
    viewerRef.current?.flyToPreset(shot);
    setPreviewingId(shot.id);
    viewerRef.current?.showCameraHelperFor(draft.cameraHelperEnabled ? shot : null);
    window.setTimeout(() => setPreviewingId(null), shot.durationMs);
  }

  return (
    <div className="space-y-3">
      <SectionHeading>Shots</SectionHeading>
      <button
        onClick={capture}
        disabled={!canEdit}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Camera className="h-3.5 w-3.5" /> Capture Shot
      </button>

      {shots.length === 0 && <p className="p-3 text-center text-xs text-neutral-600">No shots saved yet — orbit the viewport and Capture one.</p>}

      <div className="space-y-1.5">
        {shots.map((shot, i) => (
          <GroupCard key={shot.id}>
            <div className="flex items-center gap-1.5">
              {i === 0 ? (
                <span title="Opening Shot" className="shrink-0">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                </span>
              ) : (
                <button onClick={() => setOpeningShot(shot.id)} disabled={!canEdit} title="Set as Opening Shot" className="shrink-0 text-neutral-600 hover:text-amber-400 disabled:opacity-40">
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              {renamingId === shot.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    if (renameValue.trim()) renameShot(shot.id, renameValue.trim());
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className="w-full min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-100"
                />
              ) : (
                <button
                  onClick={() => {
                    setRenamingId(shot.id);
                    setRenameValue(shot.label);
                  }}
                  disabled={!canEdit}
                  className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-neutral-200"
                >
                  {shot.label}
                </button>
              )}
              <button onClick={() => preview(shot)} title="Preview" className={cn("shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white", previewingId === shot.id && "text-indigo-400")}>
                <Play className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => duplicateShot(shot.id)} disabled={!canEdit} title="Duplicate" className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-40">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => reorderShot(shot.id, "up")} disabled={!canEdit || i === 0} title="Move up" className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-20">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => reorderShot(shot.id, "down")} disabled={!canEdit || i === shots.length - 1} title="Move down" className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-20">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => deleteShot(shot.id)} disabled={!canEdit} title="Delete" className="shrink-0 rounded p-1 text-red-500 hover:bg-red-500/10 disabled:opacity-40">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2">
              <SliderRow
                label="Transition"
                value={shot.durationMs}
                min={0}
                max={8000}
                step={100}
                suffix="ms"
                disabled={!canEdit}
                onChange={(v) => configEditor.update({ cameraPresets: shots.map((s) => (s.id === shot.id ? { ...s, durationMs: v } : s)) })}
              />
            </div>
          </GroupCard>
        ))}
      </div>
    </div>
  );
}
