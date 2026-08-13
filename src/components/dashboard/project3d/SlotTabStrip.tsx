"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DetailModelSlot } from "@/lib/types";
import type { Translate } from "./editorTypes";

/**
 * Model tab's slot switcher (Multiple Detail-Model Slots pass) — every
 * project has at least one real slot ("Building", auto-created for any
 * project that had a detail model before this existed — see
 * scripts/migrate-detail-model-slots.ts). Each pill is one independently
 * uploaded/versioned/published GLB ("Building", "Surroundings", ...);
 * selecting one re-hydrates `ModelPanel`'s whole scale/rotation/altitude/
 * unit-links/scene-overrides/version-history state from that slot's own
 * data (`Project3DConfigEditor.tsx`'s `handleSelectSlot`). Delete is
 * hidden on a project's last remaining slot — a project must always have
 * somewhere to hang a detail model, matching the server-side rule.
 */
export function SlotTabStrip({
  slots,
  activeSlotId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  t,
}: {
  slots: DetailModelSlot[];
  activeSlotId: string | null;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  t: Translate;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState("");

  function commitRename() {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim());
    setRenamingId(null);
  }
  function commitAdd() {
    if (addValue.trim()) onAdd(addValue.trim());
    setAddValue("");
    setAdding(false);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {slots.map((slot) => {
        const isActive = slot.id === activeSlotId;
        const isRenaming = renamingId === slot.id;
        return (
          <div
            key={slot.id}
            className={cn(
              "group flex items-center gap-0.5 rounded-pill border pl-1 pr-1 py-1",
              isActive ? "border-brand-300 bg-brand-50" : "border-neutral-200"
            )}
          >
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="w-24 rounded border border-neutral-200 px-1.5 py-0.5 text-xs focus:border-brand-400 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(slot.id)}
                className={cn(
                  "rounded-pill px-2.5 py-1 text-xs font-semibold",
                  isActive ? "text-brand-700" : "text-neutral-600 hover:text-neutral-900"
                )}
              >
                {slot.name}
              </button>
            )}
            {!isRenaming && (
              <div
                className={cn(
                  "flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100",
                  isActive && "opacity-100"
                )}
              >
                <button
                  type="button"
                  title={t("admin.slotRename")}
                  onClick={() => {
                    setRenamingId(slot.id);
                    setRenameValue(slot.name);
                  }}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                {slots.length > 1 && (
                  <button
                    type="button"
                    title={t("admin.slotDelete")}
                    onClick={() => onDelete(slot.id)}
                    className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <input
          autoFocus
          value={addValue}
          placeholder={t("admin.slotNamePlaceholder")}
          onChange={(e) => setAddValue(e.target.value)}
          onBlur={commitAdd}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitAdd();
            if (e.key === "Escape") {
              setAdding(false);
              setAddValue("");
            }
          }}
          className="w-28 rounded-pill border border-neutral-200 px-2.5 py-1 text-xs focus:border-brand-400 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center gap-1 rounded-pill border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-500 hover:border-brand-300 hover:text-brand-600"
        >
          <Plus className="h-3 w-3" />
          {t("admin.slotAdd")}
        </button>
      )}
    </div>
  );
}
