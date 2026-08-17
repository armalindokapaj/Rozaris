"use client";

import { useState } from "react";
import { Check, ChevronDown, HelpCircle, History, Redo2, Settings, Undo2 } from "lucide-react";
import { cn, formatRelativeDate } from "@/lib/utils";
import { EDITOR_TABS, EDITOR_TAB_LABELS, type EditorTabId } from "./tabs";
import type { UseDetailModelSlotsReturn } from "@/hooks/useDetailModelSlots";
import type { UseModelEditorReturn } from "@/hooks/useModelEditor";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { Locale } from "@/lib/types";

const STEPS = ["Import", "Validate", "Configure", "Preview", "Publish"] as const;

/**
 * Global header — tab nav, workflow stepper, undo/redo, Save/Draft,
 * Version History. Rebuilt per PRD spec (Experience Editor v2, 2026-08-15):
 * a genuinely new component, not restyled from the old EditorHeader.tsx.
 * Stepper is visual-only for now (no real validation/QA gating yet — that's
 * the Publish tab's own later-phase scope, PRD §42). Undo/redo are
 * disabled placeholders: Phase 0 has no editable state that needs undoing
 * yet (the preserved upload section manages its own server-round-trip
 * actions directly, same as before).
 */
export function EditorTopBar({
  projectName,
  activeTab,
  onTabChange,
  detail,
  modelEditor,
  configEditor,
  locale,
}: {
  projectName: string;
  activeTab: EditorTabId;
  onTabChange: (tab: EditorTabId) => void;
  detail: UseDetailModelSlotsReturn;
  modelEditor: UseModelEditorReturn;
  configEditor: UseProjectConfigEditorReturn;
  locale: Locale;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const currentStepIndex = 2; // "Configure" — the only step Phase 0 actually implements

  // Camera/Shots/(eventually Sections/Interaction/Performance) live on
  // Project3DConfig, a separate always-editable singleton row — not
  // gated by detail.canEditDetail (that's specifically the versioned GLB
  // draft/publish lifecycle). One combined Save button covers both.
  const anyDirty = modelEditor.dirty || configEditor.dirty;
  const anySaving = modelEditor.saving || configEditor.saving;
  const modelSaveBlocked = modelEditor.dirty && !detail.canEditDetail;

  async function handleSave() {
    await Promise.all([modelEditor.dirty && detail.canEditDetail ? modelEditor.save() : Promise.resolve(true), configEditor.dirty ? configEditor.save() : Promise.resolve(true)]);
  }

  return (
    <header className="flex flex-col border-b border-neutral-800 bg-neutral-950 text-neutral-200">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 font-serif text-sm tracking-[0.14em] text-white">ROZARIS</span>
          <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 sm:block">
            Experience Editor
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            disabled
            title="Undo (coming with real editable state)"
            className="rounded-md p-1.5 text-neutral-600 disabled:cursor-not-allowed"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            disabled
            title="Redo (coming with real editable state)"
            className="rounded-md p-1.5 text-neutral-600 disabled:cursor-not-allowed"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <span className="h-5 w-px bg-neutral-800" />
          <div className="relative">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              title="Version history"
              className={cn("rounded-md p-1.5 hover:bg-neutral-800", historyOpen ? "text-white" : "text-neutral-400")}
            >
              <History className="h-4 w-4" />
            </button>
            {historyOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-neutral-800 bg-neutral-900 p-2 shadow-xl">
                <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                  Active slot version history
                </p>
                {detail.versions.length === 0 && <p className="px-1 py-2 text-xs text-neutral-500">No versions yet.</p>}
                {detail.versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded px-1.5 py-1 text-xs text-neutral-300">
                    <span>
                      v{v.version} · {v.publicationStatus}
                    </span>
                    <span className="text-neutral-500">{formatRelativeDate(v.createdAt, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
              detail.activeVersion?.publicationStatus === "published"
                ? "bg-green-500/15 text-green-400"
                : "bg-amber-500/15 text-amber-400"
            )}
          >
            {detail.activeVersion?.publicationStatus === "published" ? "Live" : "Draft"}
          </span>
          <button
            onClick={() => void handleSave()}
            disabled={!anyDirty || anySaving || (modelSaveBlocked && !configEditor.dirty)}
            title={
              modelSaveBlocked && !configEditor.dirty
                ? "Viewing the published version — replace to start a new draft"
                : !anyDirty
                ? "No unsaved changes"
                : undefined
            }
            className="flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {anySaving ? "Saving…" : anyDirty ? "Save*" : "Save"}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {(modelEditor.saveError || configEditor.saveError) && (
            <span title={modelEditor.saveError ?? configEditor.saveError ?? undefined} className="max-w-[140px] truncate text-[10px] font-semibold text-red-400">
              {modelEditor.saveError ?? configEditor.saveError}
            </span>
          )}
          <span className="h-5 w-px bg-neutral-800" />
          <button title="Help" className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <HelpCircle className="h-4 w-4" />
          </button>
          <button title="Settings" className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Own dedicated full-width row, always shown — real desktop-
       * responsive fix: the tab nav used to live inline in the row above,
       * sharing space with the ROZARIS branding and the Undo/Redo/
       * History/Save/Help/Settings cluster, so on any desktop window
       * narrower than ~1450px real tabs (Performance/Publish, at minimum)
       * were pushed clean off the visible edge with no scroll affordance
       * a real admin would notice. A dedicated row has the full window
       * width to itself, comfortably fitting all of EDITOR_TABS down to
       * ~960px; `overflow-x-auto` stays as a genuine fallback below that,
       * not the primary mechanism. */}
      <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto border-t border-neutral-900 px-4 py-1.5">
        {EDITOR_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold",
              activeTab === tab ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-neutral-100"
            )}
          >
            {EDITOR_TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      <div className="flex items-center justify-center gap-2 border-t border-neutral-900 px-4 py-1.5 text-[11px] text-neutral-500">
        <span className="mr-1 truncate text-neutral-400">{projectName}</span>
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-neutral-800" />}
            <span className={cn("flex items-center gap-1.5", i === currentStepIndex && "font-semibold text-white")}>
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
                  i < currentStepIndex
                    ? "bg-neutral-700 text-neutral-300"
                    : i === currentStepIndex
                    ? "bg-indigo-500 text-white"
                    : "border border-neutral-700 text-neutral-600"
                )}
              >
                {i < currentStepIndex ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              {step}
            </span>
          </div>
        ))}
      </div>
    </header>
  );
}
