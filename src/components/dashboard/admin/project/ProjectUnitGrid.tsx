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

/**
 * Project Manager → Sheet Sync → the seven sheet columns, as a real grid.
 *
 * The seven fields the Google Sheets connector reads back — UNIT, AREA,
 * PRICE, BEDROOMS, BATHROOMS, FLOOR, STATUS — used to appear in this
 * section only as a row of chips telling you what to name the columns in
 * somebody else's spreadsheet. This is those same seven names as actual
 * columns you can type into, so the common case ("three prices moved,
 * one apartment sold") doesn't need a Google Sheet, a sharing setting, a
 * column mapping and a dry run to land.
 *
 * Deliberately NOT `ProjectInventorySection`. That one is the full
 * 12-column ERP record view — row edit-mode behind a pencil, bulk bar,
 * sortable headers, add/delete. This is the low-ceremony half: every cell
 * is always live, there is no edit mode and no Save button, and the
 * difference in feel IS the request. Adding, deleting, and the other five
 * unit fields stay in Inventory; a grid that also owned those would just
 * be Inventory again, one tab to the left.
 *
 * Writes coalesce **per row, never per cell**. `unitPatchSchema` takes all
 * fields as independent optionals in one `prisma.unit.update`, so a
 * seven-field row save costs exactly what a one-field save costs: four
 * sequential DB round trips, one audit row carrying a coherent
 * before/after snapshot, one inventory-revision bump. Editing 42 cells
 * across 6 rows is 6 requests and 6 readable audit entries, not 42 of
 * each.
 *
 * The 3D BLOCK column is the one column that is NOT a `Unit` field. It
 * binds the row to a `Unit_*` node of the project's Units GLB
 * (`UnitMeshLinkV2`), which is a different table, a different endpoint, and
 * 1:1 across rows — assigning a block another unit holds swaps the two. It
 * therefore deliberately sits OUTSIDE `FIELDS`/`COLUMNS` and outside every
 * function below that assumes "a cell is a column of the Unit row"
 * (`parseCell`, `buildPatch`, `pruneNoops`, the paste matrix): it owns its
 * own state in `useUnitBlocks` and writes on change. It is rendered here,
 * rather than in a panel of its own, because the question it answers —
 * "which apartment is this block?" — is only answerable next to that
 * apartment's floor, area and price.
 *
 * INVARIANT, and the single thing to not "simplify" away: **drafts are
 * never derived from `units`.** `useProjectUnits` re-runs `load()` on a
 * 30s interval, on `window.focus` AND on `visibilitychange`, and
 * `normalizeUnit` mints fresh objects in a fresh array every time — so
 * `useEffect(() => setDrafts(fromUnits(units)), [units])` is not a race,
 * it is a guaranteed wipe of in-progress typing every 30 seconds and
 * every time the admin alt-tabs back from the spreadsheet they are
 * copying out of. Exactly one effect below keys on `units`, and it only
 * ever *drops* cells the server has caught up with.
 */

const FIELDS = ["code", "area", "price", "bedrooms", "bathrooms", "floor", "status"] as const;
type Field = (typeof FIELDS)[number];

const STATUSES: Unit["status"][] = ["available", "reserved", "sold"];

/** Column layout. The header text is the connector's own canonical sheet
 * header (`FIELD_HEADER_ALIASES[f][0]`), not Inventory's abbreviations —
 * this grid's header row is literally the header row a linked sheet needs,
 * which is the one piece of documentation that can't go stale. */
const COLUMNS: { field: Field; width: string; align: "left" | "right"; kind: "text" | "decimal" | "int" | "select" }[] = [
  { field: "code", width: "w-28", align: "left", kind: "text" },
  { field: "area", width: "w-24", align: "right", kind: "decimal" },
  { field: "price", width: "w-32", align: "right", kind: "decimal" },
  { field: "bedrooms", width: "w-28", align: "right", kind: "int" },
  { field: "bathrooms", width: "w-28", align: "right", kind: "int" },
  { field: "floor", width: "w-20", align: "right", kind: "int" },
  { field: "status", width: "w-32", align: "left", kind: "select" },
];

/** Long enough that a price typed digit-by-digit is one write, short
 * enough that a cell never sits visibly unsaved. Row blur carries the real
 * load; this only fires when someone types and then stops. */
const DEBOUNCE_MS = 800;
/** No rate limiting exists on the unit routes, so this client-side cap is
 * the only thing standing between a 30-row paste and 30 simultaneous
 * writes against one hot inventory-revision row. */
const MAX_IN_FLIGHT = 4;
const SAVED_BADGE_MS = 2000;
/** One GET per editing burst, so the section's shared `units` (the starter
 * CSV, the dry-run diff) isn't up to 30s stale after an edit. */
const SETTLE_MS = 1200;
/** Debounce before a 3D BLOCK change is committed. Shorter than
 * `DEBOUNCE_MS` — this is a discrete pick from a short list, not typing —
 * but long enough to absorb a run of `change` events from arrow-keying a
 * closed <select>. */
const BLOCK_COMMIT_MS = 400;

/** A cell the user has touched. `value` is ALWAYS the raw string typed —
 * never a number. `Number("") === 0`, and the route rejects `price: 0`
 * (`z.number().positive()`), which is exactly how clearing a price cell to
 * retype it 400s in the Inventory table today. */
interface CellDraft {
  value: string;
  /** false = sent and accepted, pinned until the server echoes it back. */
  dirty: boolean;
  /** Which `units` generation this cell was saved at — see the reconcile
   * effect. Only meaningful once `dirty` is false. */
  gen?: number;
  /** What the server last ACCEPTED for this cell, while `units` may still
   * be behind it. While present, THIS — not `unit[field]` — is what
   * "unchanged" means here. Carried across a cell going dirty again,
   * because that is precisely when it matters: typing the old value back
   * into a just-saved cell is a real correction, not a no-op. */
  saved?: string;
}
type RowDraft = Partial<Record<Field, CellDraft>>;
type Drafts = Record<string, RowDraft>;
type RowStatus = "saving" | "saved" | "error";
type PatchBody = Partial<Record<Field, string | number>>;

/** Numbers are read with the connector's OWN parser, not a local one. That
 * function already carries the hard-won separator rules a naive
 * `replace(",", ".")` gets catastrophically wrong: it reads the Albanian
 * `"125,000"` as 125000, not as 125 — the difference between a €125,000
 * apartment and a €125 one. Since this grid's whole premise is "the same
 * seven columns a sheet writes back", a value pasted out of that sheet has
 * to parse here exactly as it would there. */
function toNumber(raw: string): number | null {
  const value = parseNumericCell(raw);
  return value !== null && Number.isFinite(value) ? value : null;
}

type Parsed = { ok: true; value: string | number } | { ok: false; messageKey: string };

/** Mirrors `unitPatchSchema` (api/projects/[id]/units/[unitId]/route.ts)
 * exactly, so no cell can produce a 400. */
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
          // Half-baths are ordinary real-estate data that `.int()` refuses;
          // say so rather than repeating "whole numbers only" at someone
          // who typed something perfectly reasonable.
          messageKey: field === "bathrooms" ? "projectManager.gridHalfBathNote" : "projectManager.gridInvalidWholeNumber",
        };
      }
      return { ok: true, value };
    }
    case "floor": {
      // No lower bound on purpose — a basement is floor -1 and a ground
      // floor is 0, and the route agrees (`z.number().int()`, no `.min()`).
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

/** The cell's text when nothing has been typed into it. */
function serverText(unit: Unit, field: Field): string {
  return String(unit[field]);
}

/** Would sending this cell change anything *relative to the server row*?
 * Compared on the PARSED value, so "120.0" and "120" both read as
 * unchanged. Used only by the reconcile effect, which is the one place
 * that genuinely means "has the server caught up". */
function sameAsServer(unit: Unit, field: Field, raw: string): boolean {
  const parsed = parseCell(field, raw);
  return parsed.ok && parsed.value === unit[field];
}

/** The text this cell falls back to, and the baseline every "is this a
 * no-op?" test must use: the last accepted value while `units` is still
 * behind it, otherwise the server row. */
function baseText(unit: Unit, field: Field, cell: CellDraft | undefined): string {
  return cell?.saved ?? serverText(unit, field);
}

function sameAsBase(unit: Unit, field: Field, cell: CellDraft | undefined, raw: string): boolean {
  const parsed = parseCell(field, raw);
  if (!parsed.ok) return false;
  const base = parseCell(field, baseText(unit, field, cell));
  return base.ok && parsed.value === base.value;
}

/** A code another row already holds — counting the other rows' UNSAVED
 * drafts, not just their server values. Not politeness:
 * `@@unique([projectId, code])` plus a `prisma.unit.update` with no
 * try/catch means a duplicate comes back as an opaque 500, so this is the
 * only warning the user ever gets.
 *
 * Takes its data as arguments rather than reading refs, because it runs
 * both at render time (to paint the cell red, off state) and at flush time
 * (to drop the field from the payload, off refs). */
function isDuplicateCode(units: Unit[], drafts: Drafts, unitId: string, raw: string): boolean {
  const code = raw.trim();
  if (!code) return false;
  return units.some((u) => u.id !== unitId && (drafts[u.id]?.code?.value ?? u.code).trim() === code);
}

/** The i18n key for why this cell can't be sent, or null if it can. Mirrors
 * `unitPatchSchema` so no cell can produce a 400. */
function problemFor(units: Unit[], drafts: Drafts, unitId: string, field: Field, raw: string): string | null {
  if (field === "code" && isDuplicateCode(units, drafts, unitId, raw)) {
    return "projectManager.gridInvalidDuplicateCode";
  }
  const parsed = parseCell(field, raw);
  return parsed.ok ? null : parsed.messageKey;
}

/** One row's 3D BLOCK cell. Split out because it is the only cell in the
 * grid whose value lives outside `drafts` — bundling it into the main
 * render body would put a second, differently-shaped source of truth inside
 * the loop that reads `drafts`, which is exactly the confusion this column
 * is kept away from. */
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
  /** Every unit's code, so an option can name the row it would swap with. */
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

  /** What the <select> shows while a change is still settling. Every commit
   * here is a swap PATCH plus an audit row, and — the reason this is
   * debounced at all, the same one the STATUS column documents — on
   * Windows, Linux and Firefox the arrow keys change a CLOSED <select> in
   * place and fire `change` for every option they pass. Writing on each of
   * those would walk a unit through two or three bogus swaps, each one
   * dragging a second unit with it and each one audit-logged, on the way to
   * the option the admin actually wanted. */
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
        // Clearing `pending` is left to the response: dropping it the
        // moment the request starts would repaint the OLD value for the
        // width of the round trip, which reads as the change being rejected.
        void blocks.assign(unit.id, value || null).finally(() => setPending(null));
      }, BLOCK_COMMIT_MS);
    },
    [blocks, unit.id]
  );

  if (!target) return null;
  const current = pending ?? saved;

  /** Who else holds each block — the "(A-003)" suffix that makes a swap
   * predictable BEFORE it happens rather than a surprise after. */
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
        // NOT disabled while saving: a swap is slow enough (a transaction,
        // a document refresh and an audit write) that locking the control
        // would swallow a correction typed straight after a mistake.
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
        {/* A stored name this GLB has no node for still has to be
            selectable-and-visible, or the <select> would silently fall back
            to "—" and read as if the unit were simply unmapped. */}
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
  /** Already last-known-good guarded by the section — never `null`, and
   * never swapped for the mockData/Zustand copy (whose ids differ, which
   * would orphan every draft mid-edit). */
  units: Unit[];
  /** True while a sheet sync is writing these very rows. The interlock has
   * to run both ways: the section already refuses to sync while the grid
   * is dirty, but without this the grid stayed fully editable *during* a
   * sync, so an edit made mid-run raced the engine over the same fields
   * with no defined winner. */
  locked?: boolean;
  /** The section's own `useProjectUnits.refresh` — called once per editing
   * burst, not once per save. */
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

  // Refs are the authority for everything a timer/inflight callback reads;
  // the state copies exist only to trigger renders.
  const draftsRef = useRef<Drafts>(drafts);
  const unitsRef = useRef(units);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savedTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(new Set<string>());
  const again = useRef(new Set<string>());
  const queued = useRef(new Set<string>());
  /** Per-row generation, so a superseded response can't overwrite a newer one. */
  const seq = useRef(new Map<string, number>());
  /** Bumped once per `units` array the server hands us — i.e. once per
   * completed GET. Lets a saved cell stop pinning after a poll it cannot
   * have raced with. */
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

  /**
   * The ONE effect allowed to key on `units`. It never resets a draft — it
   * only drops a cell that was already saved once the server echoes the
   * same value back, and prunes rows deleted elsewhere. A saved cell is
   * pinned as `{dirty: false}` rather than deleted on the PATCH's own
   * success because `load()` is a wholesale replace with nothing
   * sequencing it against in-flight writes: a GET issued before the write
   * committed but resolving after it would otherwise repaint the old value
   * with no marker at all, which is indistinguishable from silent data
   * loss.
   */
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
          // The typed value is untouchable. Its stale comparison base is
          // not: expire that on the same terms as a pin, so a cell can't
          // keep measuring "unchanged" against a value the server has long
          // since moved past.
          if (
            cell.saved !== undefined &&
            (sameAsServer(unit, field, cell.saved) || unitsGen.current - (cell.gen ?? 0) >= 2)
          ) {
            rowNext = { ...rowNext, [field]: { value: cell.value, dirty: true } };
            changed = true;
          }
          continue;
        }
        // Unpin once the server agrees — or, failing that, once two whole
        // GETs have completed since the save. Without that second clause a
        // pin is permanent: if anyone else rewrites the field afterwards (a
        // colleague, or a sheet sync run from this very section), the cell
        // would keep showing OUR superseded value until a page reload. Two
        // generations, not one, because the poll that was already in flight
        // when we saved is exactly the stale one worth ignoring.
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

  /** `GET` sorts by code, so committing a code edit re-sorts the array and
   * the row under the cursor would jump — and Enter's "same column, next
   * row" would then land on a different apartment. Frozen while anything
   * is dirty; keyed on a string of ids so a poll's new array identity
   * alone never re-runs it. */
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
    // `|| isRowDirty` — a row must never filter itself out from under an
    // unsaved edit.
    return ordered.filter((u) => u.code.toLowerCase().includes(q) || isRowDirty(u.id));
  }, [ordered, query, isRowDirty]);

  /** Drops a row's transient save state. Anything that makes a previous
   * failure no longer true (a revert, a prune, a successful retry) must go
   * through here — otherwise `rowError` has no clearing path at all and the
   * red banner outlives the problem it describes. */
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

  /** Only cells that are dirty, valid, and actually different. Never
   * returns a key for a cell that would be a no-op: an empty `{}` body
   * parses clean, returns 200, and still writes an audit row and bumps the
   * revision. */
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

  /** Drops dirty cells that turned out to match the server anyway (typing
   * a value back, or a paste column that changed nothing), so they stop
   * counting as unsaved and the cell falls back to canonical text. */
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
          // Not a plain delete: if this cell is sitting on a pin, dropping
          // it outright would repaint the older server text.
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

  /** Marks exactly the cells that were sent as saved — and only if the
   * user hasn't typed over them since the request was built. */
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

  // flushRow re-enters itself (a save requested while one was in flight),
  // so it reaches itself through a ref rather than its own binding.
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
      // The DB would merge two concurrent same-row writes correctly, but
      // each response describes a whole row, so the older one landing last
      // would visually revert a field that did persist.
      if (inFlight.current.has(unitId)) {
        again.current.add(unitId);
        return;
      }
      pruneNoops(unitId);
      const patch = buildPatch(unitId);
      if (Object.keys(patch).length === 0) {
        // Nothing left to send — because it was reverted, pruned as a
        // no-op, or is invalid. Either way a previous failure no longer
        // describes this row, and leaving it up would strand a red banner
        // whose Retry can never clear it.
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
          // Only claim "saved" if nothing in this row is still waiting —
          // a queued re-flush (the user typed on while this one was in
          // flight) would otherwise show a green check over unsaved cells.
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

  /** Teardown path. A normal `fetch` started from an unmount cleanup or
   * `pagehide` isn't guaranteed to be delivered; `keepalive` is the one
   * primitive that survives the document going away (`sendBeacon` can't be
   * used — POST only, this needs PATCH). Fire-and-forget by definition:
   * nothing is left to render a failure into, which is exactly why row
   * blur, not this, is the real trigger. */
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
      // `pagehide` and the unmount cleanup can both run for one teardown.
      // Nothing here can mark a cell sent (the document is going away), so
      // dedupe on the payload itself rather than writing the same row —
      // and the same audit row, and the same revision bump — twice.
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
    // A tab switch is NOT a teardown — this component stays mounted, and
    // alt-tabbing to the spreadsheet you are copying from is the single
    // most common thing to do here. Take the NORMAL path so the rows come
    // back marked saved; the beacon path can't mark anything, which would
    // strand every flushed cell as "unsaved" and hold the sync interlock
    // shut for the rest of the session.
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

  // Unmount: the section is swapped out client-side when the left rail
  // changes, so this is the last chance for anything the row-blur flush
  // didn't already cover.
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
        // Typed back to exactly what has already been accepted — nothing to
        // save. Compared as TEXT, not parsed, so a value mid-typing ("120."
        // on its way to "120.5") is never snapped back. Compared against
        // the PIN rather than the server row, or retyping the old value
        // moments after saving would read as a no-op and quietly lose the
        // correction.
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
      // Escape undoes what the user typed, not what they already saved:
      // fall back to the pin if there is one, so a cell whose PATCH has
      // already landed doesn't repaint the pre-save value.
      if (cell.saved !== undefined) rowNext[field] = { value: cell.saved, dirty: false, gen: cell.gen, saved: cell.saved };
      else delete rowNext[field];
      const next = { ...draftsRef.current };
      if (Object.keys(rowNext).length === 0) delete next[unitId];
      else next[unitId] = rowNext;
      writeDrafts(next);
      // Undoing the last unsaved cell in a row also retires whatever the row
      // last failed to save — otherwise the red banner describes an edit
      // that no longer exists, and its Retry has nothing to send.
      if (!Object.values(rowNext).some((c) => c?.dirty)) clearRowState(unitId);
    },
    [clearRowState, writeDrafts]
  );

  /** Focus by DOM query rather than a focus-index state machine — there is
   * nothing to keep in sync with the frozen row order that way. */
  const focusCell = useCallback((row: number, col: number) => {
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`);
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);

  /** A block copied straight out of Google Sheets or Excel, dropped in at
   * the focused cell — the feature that most directly answers "without
   * leaving for Google Sheets". Truncated at the grid's edges: never wraps,
   * never creates rows. */
  const onCellPaste = useCallback(
    (e: React.ClipboardEvent, rowIndex: number, colIndex: number) => {
      const text = e.clipboardData.getData("text/plain");
      if (!/[\t\n]/.test(text)) return; // a single value — let the browser do it
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
          // Status goes through the connector's OWN vocabulary, so a
          // column pasted out of the developer's sheet ("I lirë", "SOLD
          // OUT") lands the same way a real sync would read it.
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
      // Arrows are free real estate on a single-line input, but on the
      // status <select> they already pick the value.
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.currentTarget instanceof HTMLInputElement) {
        e.preventDefault();
        focusCell(rowIndex + (e.key === "ArrowDown" ? 1 : -1), colIndex);
      }
    },
    [flushAll, focusCell, revertCell]
  );

  const onRowBlur = useCallback((e: React.FocusEvent<HTMLTableRowElement>, unitId: string) => {
    // Still inside this row — a tab from PRICE to BEDROOMS is not a commit.
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

  /** Real units with no block in the GLB, and blocks with no unit. Both are
   * exactly what the publish gate refuses a `role: units` slot for
   * (`versions/[versionId]/publish/route.ts`), so showing them here — where
   * they can be fixed — is the difference between a 422 an admin can act on
   * and one they can only read. */
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

  /** Throw away every unsaved cell. Without this, a single cell the server
   * would reject (a cleared price, a typo'd code) stayed dirty forever and
   * therefore held "Preview changes" and "Sync now" disabled — with the
   * only way out being to find that cell and press Escape on it. */
  const discardAll = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    writeDrafts({});
    setRowStatus({});
    setRowError({});
  }, [writeDrafts]);

  /** Every cell that currently won't be sent, and why. The red border and
   * the `title` tooltip between them cover a mouse user and a screen-reader
   * user; a sighted admin driving this from the keyboard would otherwise
   * see a red box with no way to find out what is wrong with it. */
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

  /**
   * One class per CSS property, always — never two `border-*`/`text-*`
   * utilities stacked and left to fight. Tailwind resolves same-property
   * conflicts by their order in the generated stylesheet, NOT by their
   * order in the class string, so appending "border-danger" after
   * "focus:border-brand-400" silently loses and an invalid cell reads
   * brand-violet while you are typing in it.
   *
   * Focus itself is left to the app's global `:focus-visible` ring
   * (globals.css, A11Y-004) rather than a border override — which is also
   * exactly the "active cell" marker a grid wants. That frees the border to
   * mean one thing only: transparent = clean, amber = unsaved, red = won't
   * be sent.
   */
  const cellClass = (state: "clean" | "dirty" | "invalid", column: (typeof COLUMNS)[number], value: string) => {
    const parts = ["w-full rounded-control border px-1.5 py-1 text-xs"];
    if (state === "invalid") parts.push("border-danger bg-danger/5 text-danger");
    else if (state === "dirty") parts.push("border-amber-300 bg-amber-50/40 text-neutral-900");
    else if (column.field === "code") parts.push("border-transparent bg-transparent text-neutral-900 hover:border-neutral-200 focus:bg-white");
    else if (column.field === "status") {
      parts.push("border-transparent bg-transparent hover:border-neutral-200 focus:bg-white");
      // Tinted off the DISPLAYED value, not the server row — a status just
      // saved but not yet echoed back by a poll must read as its new colour.
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
          {/* Never `${inputClass} w-56` — kit.tsx documents that two
              same-specificity width utilities resolve by stylesheet order,
              so `w-full` would win. */}
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
              {/* Said outright rather than left to be discovered: on a
                  published version this column is editing what the public
                  viewer is serving right now, with no publish step. */}
              {blocks.target.version.publicationStatus === "published"
                ? t("projectManager.blockLiveNote")
                : blocks.target.version.publicationStatus === "archived"
                  ? // Reachable when every version in the slot has been
                    // unpublished. Editing stays allowed — refusing would
                    // recreate the dead end this column exists to remove,
                    // and nothing is public in that state — but it changes
                    // what a rollback to this version would restore, which
                    // is worth saying out loud.
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
        // `scroll-pt-9` clears the sticky header: focus()'s scroll-into-view
        // is `block: "nearest"`, which happily parks a cell reached by
        // Enter/ArrowUp exactly underneath it.
        <div className={`-mx-4 overflow-auto scroll-thin scroll-pt-9 ${visible.length > 14 ? "max-h-[65vh]" : ""}`}>
          {/* table-fixed with the width on the <th>, not on the input:
              otherwise a right-aligned header lines up with the cell's edge
              while its right-aligned value lines up with a narrower input
              inside it, and the column visibly disagrees with itself. */}
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
                    // Sticky lives on the <th>, not the <thead>: under
                    // border-collapse a border on a detached sticky header
                    // doesn't paint, hence the inset shadow.
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
                        // The reason has to reach a screen reader too — a
                        // `title` tooltip is mouse-only, and this grid is
                        // built to be driven from the keyboard.
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
                                // Debounced like every other cell rather
                                // than committed on the spot: on Windows,
                                // Linux and Firefox the arrow keys change a
                                // CLOSED <select> in place and fire
                                // `change` for every option passed, so an
                                // immediate write would persist
                                // "reserved" on the way from "available"
                                // to "sold". Row blur and Enter still flush
                                // it instantly.
                                schedule(unit.id);
                              }}
                              className={cls}
                            >
                              {/* A pasted value the enum doesn't know still
                                  has to be visible — otherwise the select
                                  silently displays its first option and the
                                  red border looks like a lie. */}
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
                            // Never type="number": spinners swallow the
                            // ArrowUp/Down row navigation, the scroll wheel
                            // silently rewrites a focused price, and an
                            // Albanian "1,5" reads back as "".
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
                          // Keeps Tab/Enter reaching this cell as the row's
                          // last stop: `focusCell` finds cells by
                          // `data-cell="row:col"`, and COLUMNS.length is
                          // exactly the next free column index.
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
