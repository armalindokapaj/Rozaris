"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Boxes, Check, Loader2, Search } from "lucide-react";
import { useUnitBlocks } from "@/hooks/useUnitBlocks";
import { useT } from "@/lib/i18n/useT";
import {
  FIELD_HEADER_ALIASES,
  FIELD_LABELS,
  parseNumericCell,
  parseStatusCell,
} from "@/lib/integrations/normalization";
import type { Unit } from "@/lib/types";
import { Btn, EmptyState, ErrorNote, Panel, narrowInputClass } from "./kit";

const FIELDS = ["code", "area", "price", "bedrooms", "bathrooms", "floor", "status"] as const;
type Field = (typeof FIELDS)[number];

const STATUSES: Unit["status"][] = ["available", "reserved", "sold"];

const COLUMNS: { field: Field; width: string; align: "left" | "right"; kind: "text" | "decimal" | "int" | "select" }[] = [
  { field: "code", width: "w-28", align: "left", kind: "text" },
  { field: "area", width: "w-24", align: "right", kind: "decimal" },
  { field: "price", width: "w-32", align: "right", kind: "decimal" },
  { field: "bedrooms", width: "w-28", align: "right", kind: "int" },
  { field: "bathrooms", width: "w-28", align: "right", kind: "int" },
  { field: "floor", width: "w-20", align: "right", kind: "int" },
  { field: "status", width: "w-32", align: "left", kind: "select" },
];

const DEBOUNCE_MS = 800;
const MAX_IN_FLIGHT = 4;
const SAVED_BADGE_MS = 2000;
const SETTLE_MS = 1200;
const BLOCK_COMMIT_MS = 400;

interface CellDraft {
  value: string;
  dirty: boolean;
  gen?: number;
  saved?: string;
}
type RowDraft = Partial<Record<Field, CellDraft>>;
type Drafts = Record<string, RowDraft>;
type RowStatus = "saving" | "saved" | "error";
type PatchBody = Partial<Record<Field, string | number>>;

function toNumber(raw: string): number | null {
  const value = parseNumericCell(raw);
  return value !== null && Number.isFinite(value) ? value : null;
}

type Parsed = { ok: true; value: string | number } | { ok: false; messageKey: string };

function parseCell(field: Field, raw: string): Parsed {
  switch (field) {
    case "code": {
      const value = raw.trim();
      return value
        ? { ok: true, value }
        : { ok: false, messageKey: "projectManager.gridInvalidRequired" };
    }
    case "area":
    case "price": {
      const value = toNumber(raw);
      return value !== null && value > 0
        ? { ok: true, value }
        : { ok: false, messageKey: "projectManager.gridInvalidPositive" };
    }
    case "bedrooms":
    case "bathrooms": {
      const value = toNumber(raw);
      if (value === null || value < 0) return { ok: false, messageKey: "projectManager.gridInvalidWholeNumber" };
      if (!Number.isInteger(value)) {
        return {
          ok: false,
          messageKey: field === "bathrooms" ? "projectManager.gridHalfBathNote" : "projectManager.gridInvalidWholeNumber",
        };
      }
      return { ok: true, value };
    }
    case "floor": {
      const value = toNumber(raw);
      return value !== null && Number.isInteger(value)
        ? { ok: true, value }
        : { ok: false, messageKey: "projectManager.gridInvalidFloor" };
    }
    case "status":
      return STATUSES.includes(raw as Unit["status"])
        ? { ok: true, value: raw }
        : { ok: false, messageKey: "projectManager.gridInvalidRequired" };
  }
}

function serverText(unit: Unit, field: Field): string {
  return String(unit[field]);
}

function sameAsServer(unit: Unit, field: Field, raw: string): boolean {
  const parsed = parseCell(field, raw);
  return parsed.ok && parsed.value === unit[field];
}

function baseText(unit: Unit, field: Field, cell: CellDraft | undefined): string {
  return cell?.saved ?? serverText(unit, field);
}

function sameAsBase(unit: Unit, field: Field, cell: CellDraft | undefined, raw: string): boolean {
  const parsed = parseCell(field, raw);
  if (!parsed.ok) return false;
  const base = parseCell(field, baseText(unit, field, cell));
  return base.ok && parsed.value === base.value;
}

function isDuplicateCode(units: Unit[], drafts: Drafts, unitId: string, raw: string): boolean {
  const code = raw.trim();
  if (!code) return false;
  return units.some((u) => u.id !== unitId && (drafts[u.id]?.code?.value ?? u.code).trim() === code);
}

function problemFor(units: Unit[], drafts: Drafts, unitId: string, field: Field, raw: string): string | null {
  if (field === "code" && isDuplicateCode(units, drafts, unitId, raw)) {
    return "projectManager.gridInvalidDuplicateCode";
  }
  const parsed = parseCell(field, raw);
  return parsed.ok ? null : parsed.messageKey;
}

function UnitBlockCell({
  unit,
  blocks,
  codeById,
  locked,
  rowIndex,
  colIndex,
  onEnter,
}: {
  unit: Unit;
  blocks: ReturnType<typeof useUnitBlocks>;
  codeById: Map<string, string>;
  locked?: boolean;
  rowIndex: number;
  colIndex: number;
  onEnter: (nextRow: number) => void;
}) {
  const { t } = useT();
  const target = blocks.target;
  const saved = blocks.meshFor(unit.id);
  const saving = blocks.savingUnitIds.has(unit.id);

  const [pending, setPending] = useState<string | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);

  const commit = useCallback(
    (value: string) => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      setPending(value);
      commitTimer.current = setTimeout(() => {
        commitTimer.current = null;
        void blocks.assign(unit.id, value || null).finally(() => setPending(null));
      }, BLOCK_COMMIT_MS);
    },
    [blocks, unit.id]
  );

  if (!target) return null;
  const current = pending ?? saved;

  const holderCodes = new Map<string, string>();
  for (const block of target.blocks) {
    if (block.unitId && block.unitId !== unit.id) holderCodes.set(block.meshName, block.unitId);
  }

  const isOrphan = current !== null && !target.blocks.some((b) => b.meshName === current);

  return (
    <div className="flex items-center gap-1">
      <select
        data-cell={`${rowIndex}:${colIndex}`}
        aria-label={`${unit.code} — ${t("projectManager.blockColumn")}`}
        disabled={locked}
        value={current ?? ""}
        title={
          isOrphan
            ? t("projectManager.blockOrphan", { mesh: current ?? "", file: target.version.fileName })
            : undefined
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter(rowIndex + (e.shiftKey ? -1 : 1));
          }
        }}
        onChange={(e) => commit(e.target.value)}
        className={[
          "w-full rounded-control border px-1.5 py-1 text-xs",
          isOrphan
            ? "border-danger bg-danger/5 text-danger"
            : current
              ? "border-transparent bg-transparent text-neutral-900 hover:border-neutral-200 focus:bg-white"
              : "border-transparent bg-transparent text-neutral-400 hover:border-neutral-200 focus:bg-white",
        ].join(" ")}
      >
        <option value="">{t("projectManager.blockNone")}</option>
        {                                                         
                                                                   }
        {isOrphan && current && <option value={current}>{current}</option>}
        {target.blocks.map((block) => {
          const heldBy = holderCodes.get(block.meshName);
          return (
            <option key={block.meshName} value={block.meshName}>
              {block.meshName}
              {heldBy ? ` — ${codeById.get(heldBy) ?? "?"}` : ""}
            </option>
          );
        })}
      </select>
      {(saving || pending !== null) && (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-neutral-400" />
      )}
    </div>
  );
}

export function ProjectUnitGrid({
  projectId,
  units,
  locked,
  onServerChanged,
  onDirtyChange,
}: {
  projectId: string;
  units: Unit[];
  locked?: boolean;
  onServerChanged: () => void;
  onDirtyChange: (dirtyCells: number) => void;
}) {
  const { t } = useT();
  const blocks = useUnitBlocks(projectId);

  const [drafts, setDrafts] = useState<Drafts>({});
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>(() => units.map((u) => u.id));
  const [query, setQuery] = useState("");

  const draftsRef = useRef<Drafts>(drafts);
  const unitsRef = useRef(units);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savedTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(new Set<string>());
  const again = useRef(new Set<string>());
  const queued = useRef(new Set<string>());
  const seq = useRef(new Map<string, number>());
  const unitsGen = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);

  useEffect(() => {
    unitsRef.current = units;
  });

  const writeDrafts = useCallback((next: Drafts) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const dirtyCount = useMemo(
    () => Object.values(drafts).reduce((total, row) => total + Object.values(row).filter((c) => c?.dirty).length, 0),
    [drafts]
  );
  const isRowDirty = useCallback(
    (unitId: string) => Object.values(drafts[unitId] ?? {}).some((c) => c?.dirty),
    [drafts]
  );

  useEffect(() => {
    onDirtyChange(dirtyCount);
  }, [dirtyCount, onDirtyChange]);

  useEffect(() => {
    unitsGen.current += 1;
    let changed = false;
    const next: Drafts = { ...draftsRef.current };
    for (const unit of units) {
      const row = next[unit.id];
      if (!row) continue;
      let rowNext = row;
      for (const field of FIELDS) {
        const cell = rowNext[field];
        if (!cell) continue;
        if (cell.dirty) {
          if (
            cell.saved !== undefined &&
            (sameAsServer(unit, field, cell.saved) || unitsGen.current - (cell.gen ?? 0) >= 2)
          ) {
            rowNext = { ...rowNext, [field]: { value: cell.value, dirty: true } };
            changed = true;
          }
          continue;
        }
        if (sameAsServer(unit, field, cell.value) || unitsGen.current - (cell.gen ?? 0) >= 2) {
          rowNext = { ...rowNext };
          delete rowNext[field];
          changed = true;
        }
      }
      if (rowNext !== row) {
        if (Object.keys(rowNext).length === 0) delete next[unit.id];
        else next[unit.id] = rowNext;
      }
    }
    for (const id of Object.keys(next)) {
      if (!units.some((u) => u.id === id)) {
        delete next[id];
        changed = true;
      }
    }
    if (changed) writeDrafts(next);
  }, [units, writeDrafts]);

  const idsKey = units.map((u) => u.id).join("|");
  useEffect(() => {
    if (dirtyCount > 0) return;
    setOrder(unitsRef.current.map((u) => u.id));
  }, [idsKey, dirtyCount]);

  const ordered = useMemo(() => {
    const byId = new Map(units.map((u) => [u.id, u] as const));
    const frozen = order.map((id) => byId.get(id)).filter((u): u is Unit => Boolean(u));
    const seen = new Set(order);
    return [...frozen, ...units.filter((u) => !seen.has(u.id))];
  }, [units, order]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((u) => u.code.toLowerCase().includes(q) || isRowDirty(u.id));
  }, [ordered, query, isRowDirty]);

  const clearRowState = useCallback((unitId: string) => {
    setRowStatus((prev) => {
      if (!(unitId in prev)) return prev;
      const next = { ...prev };
      delete next[unitId];
      return next;
    });
    setRowError((prev) => {
      if (!(unitId in prev)) return prev;
      const next = { ...prev };
      delete next[unitId];
      return next;
    });
  }, []);

  const scheduleSettle = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      if (inFlight.current.size === 0) onServerChanged();
    }, SETTLE_MS);
  }, [onServerChanged]);

  const buildPatch = useCallback((unitId: string): PatchBody => {
    const patch: PatchBody = {};
    const unit = unitsRef.current.find((u) => u.id === unitId);
    const row = draftsRef.current[unitId];
    if (!unit || !row) return patch;
    for (const field of FIELDS) {
      const cell = row[field];
      if (!cell?.dirty) continue;
      if (problemFor(unitsRef.current, draftsRef.current, unitId, field, cell.value)) continue;
      const parsed = parseCell(field, cell.value);
      if (!parsed.ok) continue;
      if (sameAsBase(unit, field, cell, cell.value)) continue;
      patch[field] = parsed.value;
    }
    return patch;
  }, []);

  const pruneNoops = useCallback(
    (unitId: string) => {
      const unit = unitsRef.current.find((u) => u.id === unitId);
      const row = draftsRef.current[unitId];
      if (!unit || !row) return;
      let rowNext = row;
      for (const field of FIELDS) {
        const cell = rowNext[field];
        if (!cell?.dirty) continue;
        if (sameAsBase(unit, field, cell, cell.value)) {
          rowNext = { ...rowNext };
          if (cell.saved !== undefined) rowNext[field] = { value: cell.saved, dirty: false, gen: cell.gen, saved: cell.saved };
          else delete rowNext[field];
        }
      }
      if (rowNext === row) return;
      const next = { ...draftsRef.current };
      if (Object.keys(rowNext).length === 0) delete next[unitId];
      else next[unitId] = rowNext;
      writeDrafts(next);
    },
    [writeDrafts]
  );

  const markSent = useCallback(
    (unitId: string, sent: Partial<Record<Field, string>>) => {
      const row = draftsRef.current[unitId];
      if (!row) return;
      let rowNext = row;
      for (const [field, value] of Object.entries(sent) as [Field, string][]) {
        const cell = rowNext[field];
        if (!cell || cell.value !== value) continue;
        rowNext = { ...rowNext, [field]: { value, dirty: false, gen: unitsGen.current, saved: value } };
      }
      if (rowNext === row) return;
      writeDrafts({ ...draftsRef.current, [unitId]: rowNext });
    },
    [writeDrafts]
  );

  const readError = useCallback(
    async (res: Response): Promise<string> => {
      if (res.status === 404) return t("projectManager.gridRowGone");
      if (res.status === 401 || res.status === 403) return t("projectManager.gridSignedOut");
      const body = (await res.json().catch(() => null)) as
        | { error?: { fieldErrors?: Record<string, string[]> } | string }
        | null;
      if (typeof body?.error === "string") return body.error;
      const fieldErrors = typeof body?.error === "object" ? body.error?.fieldErrors : undefined;
      const first = fieldErrors && Object.entries(fieldErrors)[0];
      if (first) return `${FIELD_LABELS[first[0] as Field] ?? first[0]}: ${first[1]?.[0] ?? ""}`;
      return t("projectManager.gridSaveRowFailed");
    },
    [t]
  );

  const flushRowRef = useRef<(unitId: string) => void>(() => {});

  const drainQueue = useCallback(() => {
    for (const unitId of [...queued.current]) {
      if (inFlight.current.size >= MAX_IN_FLIGHT) return;
      queued.current.delete(unitId);
      flushRowRef.current(unitId);
    }
  }, []);

  const flushRow = useCallback(
    (unitId: string) => {
      const timer = timers.current.get(unitId);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(unitId);
      }
      if (inFlight.current.has(unitId)) {
        again.current.add(unitId);
        return;
      }
      pruneNoops(unitId);
      const patch = buildPatch(unitId);
      if (Object.keys(patch).length === 0) {
        clearRowState(unitId);
        return;
      }
      if (inFlight.current.size >= MAX_IN_FLIGHT) {
        queued.current.add(unitId);
        return;
      }

      const sent: Partial<Record<Field, string>> = {};
      const row = draftsRef.current[unitId];
      for (const field of Object.keys(patch) as Field[]) {
        const cell = row?.[field];
        if (cell) sent[field] = cell.value;
      }

      const generation = (seq.current.get(unitId) ?? 0) + 1;
      seq.current.set(unitId, generation);
      inFlight.current.add(unitId);
      setRowStatus((prev) => ({ ...prev, [unitId]: "saving" }));

      void (async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/units/${unitId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (seq.current.get(unitId) !== generation) return;
          if (!res.ok) {
            const message = await readError(res);
            setRowError((prev) => ({ ...prev, [unitId]: message }));
            setRowStatus((prev) => ({ ...prev, [unitId]: "error" }));
            return;
          }
          markSent(unitId, sent);
          setRowError((prev) => {
            if (!(unitId in prev)) return prev;
            const next = { ...prev };
            delete next[unitId];
            return next;
          });
          const stillDirty = Object.values(draftsRef.current[unitId] ?? {}).some((c) => c?.dirty);
          if (stillDirty) return;
          setRowStatus((prev) => ({ ...prev, [unitId]: "saved" }));
          const existing = savedTimers.current.get(unitId);
          if (existing) clearTimeout(existing);
          savedTimers.current.set(
            unitId,
            setTimeout(() => {
              savedTimers.current.delete(unitId);
              setRowStatus((prev) => {
                if (prev[unitId] !== "saved") return prev;
                const next = { ...prev };
                delete next[unitId];
                return next;
              });
            }, SAVED_BADGE_MS)
          );
        } catch {
          if (seq.current.get(unitId) !== generation) return;
          setRowError((prev) => ({ ...prev, [unitId]: t("projectManager.gridSaveRowFailed") }));
          setRowStatus((prev) => ({ ...prev, [unitId]: "error" }));
        } finally {
          inFlight.current.delete(unitId);
          if (again.current.delete(unitId)) flushRowRef.current(unitId);
          drainQueue();
          scheduleSettle();
        }
      })();
    },
    [buildPatch, clearRowState, drainQueue, markSent, pruneNoops, projectId, readError, scheduleSettle, t]
  );

  useEffect(() => {
    flushRowRef.current = flushRow;
  }, [flushRow]);

  const schedule = useCallback(
    (unitId: string) => {
      const existing = timers.current.get(unitId);
      if (existing) clearTimeout(existing);
      timers.current.set(
        unitId,
        setTimeout(() => {
          timers.current.delete(unitId);
          flushRowRef.current(unitId);
        }, DEBOUNCE_MS)
      );
    },
    []
  );

  const flushAll = useCallback(() => {
    for (const unitId of Object.keys(draftsRef.current)) flushRowRef.current(unitId);
  }, []);

  const beaconed = useRef(new Set<string>());
  const flushAllBeacon = useCallback(() => {
    for (const unitId of Object.keys(draftsRef.current)) {
      const pending = timers.current.get(unitId);
      if (pending) {
        clearTimeout(pending);
        timers.current.delete(unitId);
      }
      const patch = buildPatch(unitId);
      if (Object.keys(patch).length === 0) continue;
      const body = JSON.stringify(patch);
      const fingerprint = `${unitId}:${body}`;
      if (beaconed.current.has(fingerprint)) continue;
      beaconed.current.add(fingerprint);
      void fetch(`/api/projects/${projectId}/units/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }, [buildPatch, projectId]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    const onPageHide = () => flushAllBeacon();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const pending = Object.values(draftsRef.current).some((row) => Object.values(row).some((c) => c?.dirty));
      if (!pending && inFlight.current.size === 0) return;
      flushAllBeacon();
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flushAll, flushAllBeacon]);

  useEffect(() => {
    const pendingTimers = timers.current;
    const pendingSaved = savedTimers.current;
    return () => {
      flushAllBeacon();
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();
      for (const timer of pendingSaved.values()) clearTimeout(timer);
      pendingSaved.clear();
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [flushAllBeacon]);

  const setCell = useCallback(
    (unitId: string, field: Field, raw: string) => {
      const unit = unitsRef.current.find((u) => u.id === unitId);
      const next: Drafts = { ...draftsRef.current };
      const row = { ...(next[unitId] ?? {}) };
      const prev = row[field];
      if (unit && raw === baseText(unit, field, prev)) {
        if (prev?.saved !== undefined) row[field] = { value: prev.saved, dirty: false, gen: prev.gen, saved: prev.saved };
        else delete row[field];
      } else {
        row[field] = { value: raw, dirty: true, gen: prev?.gen, saved: prev?.saved };
      }
      if (Object.keys(row).length === 0) delete next[unitId];
      else next[unitId] = row;
      writeDrafts(next);
    },
    [writeDrafts]
  );

  const revertCell = useCallback(
    (unitId: string, field: Field) => {
      const row = draftsRef.current[unitId];
      const cell = row?.[field];
      if (!row || !cell) return;
      const rowNext = { ...row };
      if (cell.saved !== undefined) rowNext[field] = { value: cell.saved, dirty: false, gen: cell.gen, saved: cell.saved };
      else delete rowNext[field];
      const next = { ...draftsRef.current };
      if (Object.keys(rowNext).length === 0) delete next[unitId];
      else next[unitId] = rowNext;
      writeDrafts(next);
      if (!Object.values(rowNext).some((c) => c?.dirty)) clearRowState(unitId);
    },
    [clearRowState, writeDrafts]
  );

  const focusCell = useCallback((row: number, col: number) => {
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`);
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);

  const onCellPaste = useCallback(
    (e: React.ClipboardEvent, rowIndex: number, colIndex: number) => {
      const text = e.clipboardData.getData("text/plain");
      if (!/[\t\n]/.test(text)) return;                                          
      e.preventDefault();
      const matrix = text
        .replace(/\r/g, "")
        .replace(/\n+$/, "")
        .split("\n")
        .map((line) => line.split("\t"));
      const ids = visible.map((u) => u.id);
      const next: Drafts = { ...draftsRef.current };
      const touched: string[] = [];
      matrix.forEach((cells, r) => {
        const unitId = ids[rowIndex + r];
        if (!unitId) return;
        const unit = unitsRef.current.find((u) => u.id === unitId);
        const row = { ...(next[unitId] ?? {}) };
        let wrote = false;
        cells.forEach((raw, c) => {
          const column = COLUMNS[colIndex + c];
          if (!column) return;
          const value = column.field === "status" ? parseStatusCell(raw) ?? raw.trim() : raw.trim();
          const prev = row[column.field];
          if (unit && value === baseText(unit, column.field, prev)) {
            if (prev?.saved !== undefined) row[column.field] = { value: prev.saved, dirty: false, gen: prev.gen, saved: prev.saved };
            else delete row[column.field];
            return;
          }
          row[column.field] = { value, dirty: true, gen: prev?.gen, saved: prev?.saved };
          wrote = true;
        });
        if (Object.keys(row).length === 0) delete next[unitId];
        else next[unitId] = row;
        if (wrote) touched.push(unitId);
      });
      writeDrafts(next);
      touched.forEach(schedule);
    },
    [visible, writeDrafts, schedule]
  );

  const onCellKeyDown = useCallback(
    (e: React.KeyboardEvent, unitId: string, field: Field, rowIndex: number, colIndex: number) => {
      if (e.key === "Escape") {
        e.preventDefault();
        revertCell(unitId, field);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          flushAll();
          return;
        }
        flushRowRef.current(unitId);
        focusCell(rowIndex + (e.shiftKey ? -1 : 1), colIndex);
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.currentTarget instanceof HTMLInputElement) {
        e.preventDefault();
        focusCell(rowIndex + (e.key === "ArrowDown" ? 1 : -1), colIndex);
      }
    },
    [flushAll, focusCell, revertCell]
  );

  const onRowBlur = useCallback((e: React.FocusEvent<HTMLTableRowElement>, unitId: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    flushRowRef.current(unitId);
  }, []);

  const failedIds = useMemo(() => Object.keys(rowError), [rowError]);
  const failedCodes = useMemo(
    () =>
      failedIds
        .map((id) => units.find((u) => u.id === id)?.code)
        .filter((code): code is string => Boolean(code))
        .join(", "),
    [failedIds, units]
  );
  const savingCount = useMemo(() => Object.values(rowStatus).filter((s) => s === "saving").length, [rowStatus]);

  const codeById = useMemo(() => new Map(units.map((u) => [u.id, u.code] as const)), [units]);

  const blockGaps = useMemo(() => {
    if (!blocks.target) return null;
    const unmappedBlocks = blocks.target.blocks.filter((b) => !b.unitId).map((b) => b.meshName);
    const mapped = new Set([
      ...blocks.target.blocks.filter((b) => b.unitId).map((b) => b.unitId as string),
      ...blocks.target.orphanLinks.map((l) => l.unitId),
    ]);
    const unmappedUnits = units.filter((u) => !mapped.has(u.id)).map((u) => u.code);
    return unmappedBlocks.length || unmappedUnits.length ? { unmappedBlocks, unmappedUnits } : null;
  }, [blocks.target, units]);

  const discardAll = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    writeDrafts({});
    setRowStatus({});
    setRowError({});
  }, [writeDrafts]);

  const invalidCells = useMemo(() => {
    const out: { key: string; text: string }[] = [];
    for (const unit of units) {
      const row = drafts[unit.id];
      if (!row) continue;
      for (const field of FIELDS) {
        const cell = row[field];
        if (!cell?.dirty) continue;
        const problem = problemFor(units, drafts, unit.id, field, cell.value);
        if (problem) out.push({ key: `${unit.id}-${field}`, text: `${unit.code} · ${FIELD_LABELS[field]} — ${t(problem)}` });
      }
    }
    return out;
  }, [units, drafts, t]);

  const th = "px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400";
  const td = "px-2.5 py-1 text-neutral-700";

  const cellClass = (state: "clean" | "dirty" | "invalid", column: (typeof COLUMNS)[number], value: string) => {
    const parts = ["w-full rounded-control border px-1.5 py-1 text-xs"];
    if (state === "invalid") parts.push("border-danger bg-danger/5 text-danger");
    else if (state === "dirty") parts.push("border-amber-300 bg-amber-50/40 text-neutral-900");
    else if (column.field === "code") parts.push("border-transparent bg-transparent text-neutral-900 hover:border-neutral-200 focus:bg-white");
    else if (column.field === "status") {
      parts.push("border-transparent bg-transparent hover:border-neutral-200 focus:bg-white");
      parts.push(
        value === "available" ? "text-emerald-700" : value === "reserved" ? "text-amber-700" : "text-red-700"
      );
    } else parts.push("border-transparent bg-transparent text-neutral-700 hover:border-neutral-200 focus:bg-white");
    if (column.field === "code") parts.push("font-semibold");
    if (column.align === "right") parts.push("text-right tabular-nums");
    return parts.join(" ");
  };

  return (
    <Panel
      title={t("projectManager.gridTitle")}
      description={t("projectManager.gridDescription")}
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          {                                                          
                                       }
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("projectManager.searchUnits")}
            className={`${narrowInputClass} w-56 pl-8 text-xs`}
          />
        </div>
      }
    >
      {failedIds.length > 0 && (
        <div className="mb-3">
          <ErrorNote>
            {t("projectManager.gridSaveFailed", { codes: failedCodes })}{" "}
            {rowError[failedIds[0]]}
            <Btn
              className="ml-2 py-1"
              onClick={() => failedIds.forEach((id) => flushRowRef.current(id))}
            >
              {t("projectManager.gridRetry")}
            </Btn>
          </ErrorNote>
        </div>
      )}

      {locked && (
        <p className="mb-3 rounded-control border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] font-medium text-brand-700">
          {t("projectManager.gridSyncingLock")}
        </p>
      )}

      {blocks.error && (
        <div className="mb-3">
          <ErrorNote>
            {blocks.error}
            <Btn className="ml-2 py-1" onClick={blocks.refresh}>
              {t("projectManager.gridRetry")}
            </Btn>
          </ErrorNote>
        </div>
      )}

      {blocks.target && (
        <div className="mb-3 flex flex-wrap items-start gap-2 rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] leading-relaxed text-neutral-500">
          <Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <div className="space-y-1">
            <p>
              {t("projectManager.blockNote", {
                slot: blocks.target.slot.name,
                file: blocks.target.version.fileName,
                version: blocks.target.version.version,
              })}{" "}
              {                                                        
                                                                       }
              {blocks.target.version.publicationStatus === "published"
                ? t("projectManager.blockLiveNote")
                : blocks.target.version.publicationStatus === "archived"
                  ?
                    t("projectManager.blockArchivedNote")
                  : t("projectManager.blockDraftNote")}
            </p>
            {blocks.target.version.publicationStatus === "published" &&
              blocks.target.compiledReleaseCount > 0 && (
                <p className="text-amber-700">
                  {t("projectManager.blockStaleReleases", {
                    count: blocks.target.compiledReleaseCount,
                  })}
                </p>
              )}
            {blocks.target.newerDraftVersion !== null && (
              <p className="text-amber-700">
                {t("projectManager.blockNewerDraft", { version: blocks.target.newerDraftVersion })}
              </p>
            )}
            {blockGaps && (
              <p className="text-amber-700">
                {blockGaps.unmappedBlocks.length > 0 &&
                  t("projectManager.blockUnmappedBlocks", {
                    count: blockGaps.unmappedBlocks.length,
                    names: blockGaps.unmappedBlocks.slice(0, 5).join(", "),
                  })}
                {blockGaps.unmappedBlocks.length > 0 && blockGaps.unmappedUnits.length > 0 && " "}
                {blockGaps.unmappedUnits.length > 0 &&
                  t("projectManager.blockUnmappedUnits", {
                    count: blockGaps.unmappedUnits.length,
                    codes: blockGaps.unmappedUnits.slice(0, 5).join(", "),
                  })}
              </p>
            )}
          </div>
        </div>
      )}

      {invalidCells.length > 0 && (
        <div className="mb-3 rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          <ul className="space-y-0.5">
            {invalidCells.slice(0, 4).map((c) => (
              <li key={c.key}>{c.text}</li>
            ))}
            {invalidCells.length > 4 && (
              <li className="text-amber-600">{t("projectManager.andMoreErrors", { count: invalidCells.length - 4 })}</li>
            )}
          </ul>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-neutral-400">
        <span>{t("projectManager.showingCount", { shown: visible.length, total: units.length })}</span>
        {dirtyCount > 0 ? (
          <span className="flex items-center gap-1.5 text-amber-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            {t("projectManager.gridUnsaved", { count: dirtyCount })}
            <button onClick={discardAll} className="font-semibold underline hover:text-amber-700">
              {t("projectManager.gridDiscard", { count: dirtyCount })}
            </button>
          </span>
        ) : savingCount > 0 ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("projectManager.gridSaving")}
          </span>
        ) : (
          <span>{t("projectManager.gridAllSaved")}</span>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState>
          {units.length === 0 ? t("projectManager.gridNoUnits") : t("projectManager.noUnitsMatch")}
        </EmptyState>
      ) : (
        <div className={`-mx-4 overflow-auto scroll-thin scroll-pt-9 ${visible.length > 14 ? "max-h-[65vh]" : ""}`}>
          {                                                            
                                                                         }
          <table
            className={
              blocks.target
                ? "w-full min-w-[904px] table-fixed text-xs"
                : "w-full min-w-[760px] table-fixed text-xs"
            }
          >
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.field}
                    title={FIELD_LABELS[column.field]}
                    className={`${th} ${column.width} sticky top-0 z-10 bg-neutral-50 shadow-[inset_0_-1px_0_0_var(--color-neutral-200)] ${
                      column.align === "right" ? "text-right" : ""
                    }`}
                  >
                    {FIELD_HEADER_ALIASES[column.field][0]}
                  </th>
                ))}
                {blocks.target && (
                  <th
                    title={t("projectManager.blockColumnHelp", { file: blocks.target.version.fileName })}
                    className={`${th} sticky top-0 z-10 w-36 bg-neutral-50 shadow-[inset_0_-1px_0_0_var(--color-neutral-200)]`}
                  >
                    {t("projectManager.blockColumn")}
                  </th>
                )}
                <th
                  className={`${th} sticky top-0 z-10 w-10 bg-neutral-50 shadow-[inset_0_-1px_0_0_var(--color-neutral-200)]`}
                >
                  <span className="sr-only">{t("projectManager.gridRowState")}</span>
                </th>
              </tr>
            </thead>
            <tbody ref={bodyRef} className="divide-y divide-neutral-100">
              {visible.map((unit, rowIndex) => {
                const status = rowStatus[unit.id];
                const rowDirty = isRowDirty(unit.id);
                return (
                  <tr
                    key={unit.id}
                    onBlur={(e) => onRowBlur(e, unit.id)}
                    className={status === "error" ? "bg-danger/5" : "hover:bg-neutral-50/60"}
                  >
                    {COLUMNS.map((column, colIndex) => {
                      const draft = drafts[unit.id]?.[column.field];
                      const value = draft?.value ?? serverText(unit, column.field);
                      const problem = draft?.dirty ? problemFor(units, drafts, unit.id, column.field, value) : null;
                      const cls = cellClass(problem ? "invalid" : draft?.dirty ? "dirty" : "clean", column, value);
                      const problemId = `${unit.id}-${column.field}-problem`;
                      const shared = {
                        "data-cell": `${rowIndex}:${colIndex}`,
                        "aria-label": `${unit.code} — ${FIELD_LABELS[column.field]}`,
                        "aria-invalid": problem ? (true as const) : undefined,
                        "aria-describedby": problem ? problemId : undefined,
                        title: problem ? t(problem) : undefined,
                        disabled: locked,
                        onPaste: (e: React.ClipboardEvent) => onCellPaste(e, rowIndex, colIndex),
                        onKeyDown: (e: React.KeyboardEvent) =>
                          onCellKeyDown(e, unit.id, column.field, rowIndex, colIndex),
                      };
                      return (
                        <td key={column.field} className={td}>
                          {problem && (
                            <span id={problemId} className="sr-only">
                              {t(problem)}
                            </span>
                          )}
                          {column.kind === "select" ? (
                            <select
                              {...shared}
                              value={value}
                              onChange={(e) => {
                                setCell(unit.id, column.field, e.target.value);
                                schedule(unit.id);
                              }}
                              className={cls}
                            >
                              {                                             
                                                                 }
                              {!STATUSES.includes(value as Unit["status"]) && (
                                <option value={value}>{value || "—"}</option>
                              )}
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {t(`projectManager.status.${s}`)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              {...shared}
                              type="text"
                              inputMode={column.kind === "text" ? undefined : column.kind === "int" ? "numeric" : "decimal"}
                              value={value}
                              onChange={(e) => {
                                setCell(unit.id, column.field, e.target.value);
                                schedule(unit.id);
                              }}
                              onFocus={(e) => e.currentTarget.select()}
                              className={cls}
                            />
                          )}
                        </td>
                      );
                    })}
                    {blocks.target && (
                      <td className={td}>
                        <UnitBlockCell
                          unit={unit}
                          blocks={blocks}
                          codeById={codeById}
                          locked={locked}
                          rowIndex={rowIndex}
                          colIndex={COLUMNS.length}
                          onEnter={(next) => focusCell(next, COLUMNS.length)}
                        />
                      </td>
                    )}
                    <td className={`${td} text-right`}>
                      {status === "saving" ? (
                        <Loader2 className="ml-auto h-3 w-3 animate-spin text-neutral-400" />
                      ) : status === "error" ? (
                        <AlertCircle
                          className="ml-auto h-3.5 w-3.5 text-danger"
                          aria-label={rowError[unit.id]}
                        />
                      ) : status === "saved" ? (
                        <Check className="ml-auto h-3.5 w-3.5 text-emerald-500" />
                      ) : rowDirty ? (
                        <span
                          title={t("projectManager.gridPending")}
                          className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">{t("projectManager.gridHelp")}</p>
    </Panel>
  );
}
