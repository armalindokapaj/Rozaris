"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DetailModelSlot } from "@/lib/types";

/**
 * Scene tab's slot switcher — ported near-verbatim from the pre-rebuild
 * editor's SlotTabStrip.tsx (Multiple Detail-Model Slots pass) as part of
 * "keep the uploading files section the same" (Experience Editor v2
 * rebuild, 2026-08-15). Every project has at least one real slot
 * ("Building"); delete is hidden on a project's last remaining slot,
 * matching the server-side rule.
 */
export function SlotTabStrip({
  slots,
  activeSlotId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  slots: DetailModelSlot[];
  activeSlotId: string | null;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
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
              "group flex items-center gap-0.5 rounded-full border pl-1 pr-1 py-1",
              isActive ? "border-indigo-300 bg-indigo-50" : "border-neutral-200"
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
                className="w-24 rounded border border-neutral-200 px-1.5 py-0.5 text-xs focus:border-indigo-400 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(slot.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  isActive ? "text-indigo-700" : "text-neutral-600 hover:text-neutral-900"
                )}
              >
                {slot.name}
              </button>
            )}
            {!isRenaming && (
              <div className={cn("flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100", isActive && "opacity-100")}>
                <button
                  type="button"
                  title="Rename"
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
                    title="Delete slot"
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
          placeholder="Slot name"
          onChange={(e) => setAddValue(e.target.value)}
          onBlur={commitAdd}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitAdd();
            if (e.key === "Escape") {
              setAdding(false);
              setAddValue("");
            }
          }}
          className="w-28 rounded-full border border-neutral-200 px-2.5 py-1 text-xs focus:border-indigo-400 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-500 hover:border-indigo-300 hover:text-indigo-600"
        >
          <Plus className="h-3 w-3" />
          Add slot
        </button>
      )}
    </div>
  );
}
