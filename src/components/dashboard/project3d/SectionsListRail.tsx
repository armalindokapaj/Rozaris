"use client";

import { useMemo, useState } from "react";
import { Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Section } from "@/lib/types";
import type { Translate } from "./editorTypes";

/**
 * Left rail content while the Sections tab is active (first-class
 * Configurator module, 2026-08-13) — replaces `BuildingNavRail` for this
 * one tab only (`EditorShell.tsx` switches between the two based on
 * `activeMode`). Real `Project3DConfig.sections`, grouped by
 * `Section.buildingName` (falls back to a single ungrouped list for
 * project-scoped sections) — no mock rows.
 */
export function SectionsListRail({
  sections,
  selectedSectionId,
  onSelect,
  onDrawNew,
  drawing,
  onDuplicate,
  onRename,
  onToggleHidden,
  onDelete,
  t,
}: {
  sections: Section[];
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  onDrawNew: () => void;
  /** True while `beginDrawSection`'s two-click flow is in progress — the
   * button becomes a visible "Cancel" state instead of relying on the
   * admin remembering Esc exists. */
  drawing: boolean;
  onDuplicate: (section: Section) => void;
  onRename: (id: string, name: string) => void;
  onToggleHidden: (id: string) => void;
  onDelete: (id: string) => void;
  t: Translate;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const groups = useMemo(() => {
    const byBuilding = new Map<string, Section[]>();
    for (const s of sections) {
      const key = s.buildingName ?? "—";
      if (!byBuilding.has(key)) byBuilding.set(key, []);
      byBuilding.get(key)!.push(s);
    }
    return Array.from(byBuilding.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sections]);

  function commitRename() {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim());
    setRenamingId(null);
  }

  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
        {t("admin.sectionsListTitle")}
      </h4>

      <button
        type="button"
        onClick={onDrawNew}
        className={cn(
          "mb-3 flex w-full items-center justify-center gap-1.5 rounded-control border px-3 py-2 text-xs font-semibold",
          drawing
            ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
            : "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100"
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {drawing ? t("admin.sectionsDrawCancel") : t("admin.sectionsDrawButton")}
      </button>

      {sections.length === 0 ? (
        <p className="text-xs text-neutral-400">{t("admin.sectionsEmpty")}</p>
      ) : (
        <div className="space-y-3">
          {groups.map(([buildingName, groupSections]) => (
            <div key={buildingName}>
              <p className="mb-1 truncate px-1 text-xs font-bold text-neutral-800">{buildingName}</p>
              <div className="space-y-0.5">
                {groupSections.map((section) => {
                  const isActive = selectedSectionId === section.id;
                  const isRenaming = renamingId === section.id;
                  return (
                    <div
                      key={section.id}
                      className={cn(
                        "group flex items-center gap-1 rounded-control px-2 py-1.5",
                        isActive ? "bg-brand-500 text-white" : "text-neutral-600 hover:bg-neutral-100"
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
                          className="min-w-0 flex-1 rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-neutral-800"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelect(section.id)}
                          className={cn(
                            "min-w-0 flex-1 truncate text-left text-xs font-medium",
                            section.hidden && !isActive && "text-neutral-400"
                          )}
                        >
                          {section.name}
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
                            title={t("admin.sectionRename")}
                            onClick={() => {
                              setRenamingId(section.id);
                              setRenameValue(section.name);
                            }}
                            className={cn(
                              "rounded p-1 disabled:opacity-40",
                              isActive ? "hover:bg-white/20" : "hover:bg-neutral-200"
                            )}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title={t("admin.sectionDuplicate")}
                            onClick={() => onDuplicate(section)}
                            className={cn(
                              "rounded p-1 disabled:opacity-40",
                              isActive ? "hover:bg-white/20" : "hover:bg-neutral-200"
                            )}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title={section.hidden ? t("admin.sectionShow") : t("admin.sectionHide")}
                            onClick={() => onToggleHidden(section.id)}
                            className={cn(
                              "rounded p-1 disabled:opacity-40",
                              isActive ? "hover:bg-white/20" : "hover:bg-neutral-200"
                            )}
                          >
                            {section.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                          <button
                            type="button"
                            title={t("admin.sectionDelete")}
                            onClick={() => {
                              if (window.confirm(t("admin.sectionDeleteConfirm"))) onDelete(section.id);
                            }}
                            className={cn(
                              "rounded p-1 disabled:opacity-40",
                              isActive ? "text-white hover:bg-white/20" : "text-red-500 hover:bg-red-50"
                            )}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
