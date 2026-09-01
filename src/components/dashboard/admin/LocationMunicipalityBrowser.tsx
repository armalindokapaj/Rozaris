"use client";

import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { typeLabelKey, type LocationRow } from "./LocationsTab";

function siblingsOf(all: LocationRow[], parentId: string | null): LocationRow[] {
  return [...all]
    .filter((l) => l.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.officialName.localeCompare(b.officialName));
}

function buildTree(all: LocationRow[], rootId: string): { row: LocationRow; depth: number }[] {
  const root = all.find((l) => l.id === rootId);
  if (!root) return [];
  const out: { row: LocationRow; depth: number }[] = [{ row: root, depth: 0 }];
  function walk(parentId: string, depth: number) {
    for (const child of siblingsOf(all, parentId)) {
      out.push({ row: child, depth });
      walk(child.id, depth + 1);
    }
  }
  walk(root.id, 1);
  return out;
}

export function LocationMunicipalityBrowser({
  locations,
  onChanged,
}: {
  locations: LocationRow[];
  onChanged: () => void;
}) {
  const { t } = useT();
  const [municipalityId, setMunicipalityId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const municipalities = useMemo(
    () => locations.filter((l) => l.type === "municipality").sort((a, b) => a.officialName.localeCompare(b.officialName)),
    [locations]
  );
  const tree = useMemo(
    () => (municipalityId ? buildTree(locations, municipalityId) : []),
    [locations, municipalityId]
  );

  async function move(row: LocationRow, direction: -1 | 1) {
    const siblings = siblingsOf(locations, row.parentId);
    const idx = siblings.findIndex((s) => s.id === row.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setBusyId(row.id);
    setError(null);
    try {
      const results = await Promise.all(
        reordered.map((s, i) =>
          fetch(`/api/admin/locations/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: i }),
          })
        )
      );
      if (results.some((r) => !r.ok)) throw new Error();
      onChanged();
    } catch {
      setError(t("admin.locations.reorderFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function rename(row: LocationRow) {
    const next = window.prompt(t("admin.locations.renamePrompt", { name: row.officialName }), row.officialName);
    if (!next || !next.trim() || next.trim() === row.officialName) return;
    setBusyId(row.id);
    const res = await fetch(`/api/admin/locations/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ officialName: next.trim() }),
    });
    setBusyId(null);
    if (res.ok) onChanged();
    else setError(t("admin.locations.renameFailed"));
  }

  async function toggleActive(row: LocationRow) {
    setBusyId(row.id);
    const res = await fetch(`/api/admin/locations/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    setBusyId(null);
    if (res.ok) onChanged();
  }

  async function remove(row: LocationRow) {
    if (!window.confirm(t("admin.locations.deleteConfirm", { name: row.officialName }))) return;
    setBusyId(row.id);
    const res = await fetch(`/api/admin/locations/${row.id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) {
      onChanged();
    } else {
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : t("admin.locations.deleteFailed"));
    }
  }

  return (
    <div className="space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-bold text-neutral-900">{t("admin.locations.browserSectionTitle")}</h2>
        <p className="text-xs text-neutral-500">{t("admin.locations.browserSubtitle")}</p>
      </div>

      <label className="block max-w-xs">
        <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.locations.typeMunicipality")}</span>
        <select
          value={municipalityId}
          onChange={(e) => setMunicipalityId(e.target.value)}
          className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
        >
          <option value="">{t("admin.locations.browserPickPlaceholder")}</option>
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>
              {m.officialName}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="rounded-control bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      {municipalityId && (
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-control border border-neutral-200">
          {tree.map(({ row, depth }) => {
            const siblings = siblingsOf(locations, row.parentId);
            const idx = siblings.findIndex((s) => s.id === row.id);
            const inUse = row.childCount + row.propertyCount + row.projectCount > 0;
            const busy = busyId === row.id;
            return (
              <div
                key={row.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm ${row.isActive ? "" : "opacity-50"}`}
                style={{ paddingLeft: `${12 + depth * 24}px` }}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-neutral-800">{row.officialName}</span>
                  <span className="ml-2 text-xs text-neutral-400">{t(typeLabelKey(row.type))}</span>
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    disabled={busy || idx <= 0}
                    onClick={() => move(row, -1)}
                    title={t("admin.locations.moveUpAction")}
                    className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || idx < 0 || idx >= siblings.length - 1}
                    onClick={() => move(row, 1)}
                    title={t("admin.locations.moveDownAction")}
                    className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => rename(row)}
                    title={t("admin.locations.renameAction")}
                    className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(row)}
                    title={row.isActive ? t("admin.locations.deactivateAction") : t("admin.locations.activateAction")}
                    className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                  >
                    {row.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    disabled={inUse}
                    onClick={() => remove(row)}
                    title={t("admin.locations.deleteAction")}
                    className="rounded-control p-1 text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
