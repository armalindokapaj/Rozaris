"use client";

import { useState } from "react";
import { CloudSun, Download, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import { GroupCard, SectionHeading } from "../fields";
import { useEnvironmentPresets } from "@/hooks/useEnvironmentPresets";
import { ENVIRONMENT_PRESET_FIELD_GROUPS, pickEnvironmentPresetConfig } from "@/lib/environmentPresetFields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { Locale } from "@/lib/types";

export function PresetsPanel({ configEditor, locale }: { configEditor: UseProjectConfigEditorReturn; locale: Locale }) {
  const { presets, loaded, busy, error, flash, saveAsNewPreset, updatePresetConfig, renamePreset, deletePreset } = useEnvironmentPresets();
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function handleSaveNew() {
    if (!newName.trim()) return;
    const ok = await saveAsNewPreset(newName.trim(), pickEnvironmentPresetConfig(configEditor.draft));
    if (ok) setNewName("");
  }

  function handleApply(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    if (
      !window.confirm(
        `Apply "${preset.name}"? This overwrites this project's Sun & Sky, Fog & Haze, Clouds, Water, Lens Flare/Bloom, and Tone Mapping/LUT settings with the preset's values — Save to keep it, Publish to go live.`
      )
    )
      return;
    configEditor.update(preset.config);
  }

  function handleUpdate(presetId: string, name: string) {
    if (
      !window.confirm(
        `Update "${name}" to match this project's current settings? This overwrites the saved preset for every project that loads it.`
      )
    )
      return;
    void updatePresetConfig(presetId, pickEnvironmentPresetConfig(configEditor.draft));
  }

  return (
    <div className="space-y-3">
      <SectionHeading>Save Current Look</SectionHeading>
      <GroupCard>
        <p className="mb-2 text-[11px] text-neutral-400">
          Bundles this project&apos;s Sun &amp; Sky, Fog &amp; Haze, Clouds, Water, Lens Flare &amp; Bloom, and Tone Mapping/LUT
          settings into a reusable preset any other project&apos;s Presets tab can load.
        </p>
        <div className="flex items-center gap-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSaveNew()}
            placeholder='Preset name, e.g. "Golden Hour Coastal"'
            className="w-full min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-100 placeholder:text-neutral-600"
          />
          <button
            onClick={() => void handleSaveNew()}
            disabled={busy || !newName.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </GroupCard>

      <SectionHeading>Included Settings</SectionHeading>
      <GroupCard>
        <div className="flex flex-wrap gap-1">
          {ENVIRONMENT_PRESET_FIELD_GROUPS.map((g) => (
            <span
              key={g.id}
              title={`${g.fieldNames.length} fields`}
              className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-400"
            >
              {g.label}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-neutral-600">
          Camera, Quality/Performance, Ground, Unit Colors, Sections, and Shadows/GI stay per-project — not included.
        </p>
      </GroupCard>

      <SectionHeading>Library{presets.length > 0 ? ` (${presets.length})` : ""}</SectionHeading>
      {!loaded && <p className="p-3 text-center text-xs text-neutral-600">Loading…</p>}
      {loaded && presets.length === 0 && (
        <p className="p-3 text-center text-xs text-neutral-600">No presets saved yet — save this project&apos;s look above to start the library.</p>
      )}
      <div className="space-y-1.5">
        {presets.map((preset) => (
          <GroupCard key={preset.id}>
            <div className="flex items-center gap-1.5">
              <CloudSun className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
              {renamingId === preset.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    if (renameValue.trim()) void renamePreset(preset.id, renameValue.trim());
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className="w-full min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-100"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-200">{preset.name}</span>
              )}
              <button onClick={() => handleApply(preset.id)} title="Apply to this project" className="shrink-0 rounded p-1 text-neutral-400 hover:bg-indigo-500/20 hover:text-indigo-300">
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleUpdate(preset.id, preset.name)}
                title="Overwrite this preset with this project's current settings"
                className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setRenamingId(preset.id);
                  setRenameValue(preset.name);
                }}
                title="Rename"
                className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => void deletePreset(preset.id)} title="Delete" className="shrink-0 rounded p-1 text-red-500 hover:bg-red-500/10">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 pl-5 text-[10px] text-neutral-600">
              Updated {formatRelativeDate(preset.updatedAt, locale)}
              {preset.createdBy ? ` · ${preset.createdBy}` : ""}
            </p>
          </GroupCard>
        ))}
      </div>

      {error && <p className="text-[11px] font-medium text-red-400">{error}</p>}
      {flash && <p className="text-[11px] font-medium text-green-400">{flash}</p>}
    </div>
  );
}
