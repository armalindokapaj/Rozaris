import {
  FIELD_HEADER_ALIASES,
  matchHeaderToField,
  parseNumericCell,
  parseStatusCell,
  type RawInventoryRow,
  type SyncableField,
} from "./normalization";

/**
 * A sheet that WAS fetched but doesn't hold usable inventory (no unit-code
 * column). Distinct from a fetch/permission failure, because the two need
 * opposite fixes — one is a Google sharing setting, the other is a header
 * row — and because a bad gateway is the wrong thing to tell someone whose
 * spreadsheet downloaded perfectly.
 */
export class SheetParseError extends Error {
  /** The header row as it actually reads, so the caller can offer a
   * mapping UI instead of a dead end — "name a column UNIT or map it by
   * hand" is useless advice if the admin can't see their own headers. */
  readonly headers: string[];
  constructor(message: string, headers: string[] = []) {
    super(message);
    this.name = "SheetParseError";
    this.headers = headers;
  }
}

/** What a sheet turned out to contain, beyond the rows themselves — the
 * connector UI shows this so an admin can see which of their columns were
 * understood BEFORE any write happens (PRD §22 "the mapping must be
 * visible, not magic"). */
export interface SheetParseResult {
  rows: RawInventoryRow[];
  /** Header text exactly as it appears in the sheet, in sheet order. */
  headers: string[];
  /** header -> the `Unit` field it was matched to (built-in alias or the
   * connector's own `columnMapping`). */
  recognized: Record<string, SyncableField>;
  /** Headers that matched nothing — ignored, never an error. A developer's
   * own "NOTES"/"AGENT" column must not break their sync. */
  ignored: string[];
}

/** A Google Sheets reference, however the admin supplied it. */
export interface SheetRef {
  sheetId: string;
  /** Which tab within the workbook. "0" is the first one — what a plain
   * `/edit` URL with no `#gid=` fragment means. */
  gid: string;
}

/**
 * Accepts what a developer actually sends over — the whole browser URL —
 * as well as a bare id, and pulls out both the workbook id and the
 * specific tab (`#gid=` / `?gid=`). Real Sheets URLs this handles:
 *
 *   https://docs.google.com/spreadsheets/d/1AbC.../edit#gid=1874
 *   https://docs.google.com/spreadsheets/d/1AbC.../edit?usp=sharing
 *   https://docs.google.com/spreadsheets/d/1AbC.../edit?gid=0#gid=0
 *   1AbC...                                        (bare id, still fine)
 *
 * Returns null for anything that isn't one — a Drive folder link, a Docs
 * link, a typo — so the connector can reject it with a real message
 * instead of storing a dead id that only fails later at sync time.
 */
export function parseSheetRef(input: string): SheetRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]{20,})/);
  if (urlMatch) {
    const gidMatch = trimmed.match(/[#?&]gid=([0-9]+)/);
    return { sheetId: urlMatch[1], gid: gidMatch?.[1] ?? "0" };
  }

  // A bare id — Google's own ids are long base64url-ish strings; anything
  // shorter (or containing a slash) is a link to something that isn't a
  // spreadsheet, not an id.
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return { sheetId: trimmed, gid: "0" };
  }
  return null;
}

/** The normal browser URL for a stored ref — the connector UI links back
 * to the sheet it's syncing from, so "which file is this actually
 * reading" is one click away rather than an id an admin has to trust. */
export function sheetEditUrl(sheetId: string, gid = "0"): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}`;
}

/**
 * Multi-Channel Publishing PRD Phase 8, §20 "Google Sheets architecture" —
 * fetches a Sheet via its public CSV export URL
 * (`docs.google.com/spreadsheets/d/{id}/export?format=csv`), which needs
 * NO credential at all as long as the sheet is shared "Anyone with the
 * link can view" — the PRD's "Simple client" tier (§6).
 *
 * **Happy path live-verified (2026-08-18)** against a real, long-lived
 * publicly-shared Google Sheet (Google's own Sheets-API-quickstart sample
 * — not anything created for this test, since the only Drive tool
 * available here can share with a specific email address, not "anyone
 * with a link," so it couldn't have produced a fetchable URL anyway):
 * confirmed the 307 redirect Google issues from `/export?format=csv` to
 * its `googleusercontent.com` CDN is followed correctly by a plain
 * `fetch()` (no `redirect` option needed), `Content-Type` comes back
 * `text/csv` (not the HTML sign-in page), and the header row is parsed
 * and searched for a unit column correctly. `parseInventoryCsv` itself
 * separately verified against real UNIT/AREA/PRICE/BEDROOMS/BATHROOMS/
 * FLOOR/STATUS-shaped CSV text (quoted comma-containing prices, European
 * thousands separators, missing cells, unknown extra columns, missing
 * unit column) — all correct.
 *
 * The "Professional"/"Enterprise" tiers (§6 — private sheets via real
 * OAuth/service-account auth against the Sheets API v4) are NOT
 * implemented — this environment has no Google Cloud credential to build
 * or test that against.
 */
/** How long to wait on Google before giving up with a readable message. */
const SHEET_FETCH_TIMEOUT_MS = 15_000;
/** Hard ceiling on the CSV we will pull into memory. A real inventory
 * sheet is tens of kilobytes; anything past this is the wrong tab (or the
 * wrong file), and buffering it whole would be the failure rather than
 * revealing one. Roughly 100k rows of this shape. */
const SHEET_MAX_BYTES = 8 * 1024 * 1024;
/** Ceiling on rows handed to the engine, mirroring the manual connector's
 * own `max(2000)` — which until now applied only to inline `rows`, so the
 * Google path was the one with no bound at all. */
export const SHEET_MAX_ROWS = 5000;

/** `res.text()` with a byte budget: streams and stops as soon as the cap
 * is passed, so an accidental 2 GB export fails fast instead of taking the
 * function down with it. */
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > SHEET_MAX_BYTES) {
        throw new Error(
          `That sheet is larger than ${Math.round(SHEET_MAX_BYTES / (1024 * 1024))} MB. Point the connector at the tab holding the unit list rather than the whole workbook.`
        );
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

export async function fetchGoogleSheet(
  sheetId: string,
  gid = "0",
  columnMapping?: Record<string, string> | null
): Promise<SheetParseResult> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  // Bounded on purpose. This runs inside a serverless request an admin is
  // waiting on: without a signal, a Google endpoint that accepts the
  // connection and then stalls holds the function until the platform kills
  // it, and the admin gets a blank failure with no message.
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(SHEET_FETCH_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(
        `Google did not answer within ${Math.round(SHEET_FETCH_TIMEOUT_MS / 1000)}s. The sheet may be very large, or Google may be having trouble — try again.`
      );
    }
    throw new Error(err instanceof Error ? `Could not reach Google Sheets: ${err.message}` : "Could not reach Google Sheets.");
  }
  if (!res.ok) {
    throw new Error(
      `Could not fetch the Google Sheet (HTTP ${res.status}). Is it shared as "Anyone with the link can view"?`
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    // Google serves an HTML sign-in/permission page (still 200 OK) rather
    // than a real CSV for a sheet that isn't actually link-shared — a real
    // failure mode worth its own message rather than silently "succeeding"
    // with zero parseable rows.
    throw new Error('This Google Sheet is not publicly viewable — share it as "Anyone with the link can view" and retry.');
  }
  const csv = await readCapped(res);
  return parseInventoryCsv(csv, columnMapping);
}

/**
 * PRD §21's sheet structure, widened to the full editable set: a unit-code
 * column (required) plus any of AREA / PRICE / BEDROOMS / BATHROOMS /
 * FLOOR / STATUS. Header row required, column ORDER irrelevant (matched by
 * header name via `matchHeaderToField`, which also honours the connector's
 * own `columnMapping` overrides). Unknown/extra columns are ignored, not
 * rejected — a sheet a client has customized with their own notes column
 * shouldn't break the sync.
 *
 * A cell left EMPTY means "don't touch this field on this unit", not
 * "set it to zero" — the difference matters enormously on a price column
 * where a developer has filled in only the 4 units they re-priced today.
 */
/** How far down to look for the header row before giving up. Generous
 * enough for a title + a blank + a subtitle, small enough that a sheet
 * with no header at all still fails fast. */
const HEADER_SCAN_ROWS = 10;

/** The first row that names a unit-code column, or 0 if none does. */
function findHeaderRow(lines: string[][], columnMapping?: Record<string, string> | null): number {
  const limit = Math.min(lines.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i += 1) {
    const hasCode = lines[i].some((cell) => matchHeaderToField(cell.trim(), columnMapping) === "code");
    if (hasCode) return i;
  }
  return 0;
}

export function parseInventoryCsv(
  csv: string,
  columnMapping?: Record<string, string> | null
): SheetParseResult {
  const lines = splitCsvRows(csv);
  if (lines.length === 0) {
    return { rows: [], headers: [], recognized: {}, ignored: [] };
  }

  // The header row is not always row 0. Real developer sheets routinely
  // open with a title ("TOWER VLORA — SHITJE 2026"), a blank spacer, or a
  // merged banner, and assuming row 0 made every one of those unreadable —
  // with the mapping editor, offered as the fix, showing the cells of the
  // TITLE row, so it could not fix it either. Take the first row within
  // the first few that actually names a unit-code column; fall back to row
  // 0 so the "no unit column" error still describes what the admin sees.
  const headerRowIndex = findHeaderRow(lines, columnMapping);
  const headers = lines[headerRowIndex].map((h) => h.trim());
  const recognized: Record<string, SyncableField> = {};
  const ignored: string[] = [];
  /** column index -> field. Built once, not per row. */
  const fieldByIndex = new Map<number, SyncableField>();

  headers.forEach((header, index) => {
    if (!header) return;
    const field = matchHeaderToField(header, columnMapping);
    // First column wins if a sheet somehow has two headers naming the same
    // field ("PRICE" and "ÇMIMI" side by side) — deterministic beats
    // last-write-wins, and the UI shows which one was used.
    if (field && !Object.values(recognized).includes(field)) {
      recognized[header] = field;
      fieldByIndex.set(index, field);
    } else {
      ignored.push(header);
    }
  });

  if (!Object.values(recognized).includes("code")) {
    throw new SheetParseError(
      `Sheet has no unit-code column. Name one of your columns "UNIT" (also accepted: ${FIELD_HEADER_ALIASES.code
        .slice(1, 5)
        .join(", ")}), or map one of the columns below onto "Unit code".`,
      headers.filter(Boolean)
    );
  }

  const rows: RawInventoryRow[] = [];
  for (const cells of lines.slice(headerRowIndex + 1)) {
    const row: RawInventoryRow = {};
    for (const [index, field] of fieldByIndex) {
      const cell = (cells[index] ?? "").trim();
      if (!cell) continue; // empty cell == "leave this field alone"
      if (field === "code") {
        row.code = cell;
      } else if (field === "status") {
        // A punctuation-only status ("-", "—", "n/a" dashes) is a
        // placeholder, not a value. `parseStatusCell` returns null for it;
        // assigning that null made zod reject the ENTIRE row, so one dash
        // in the status column threw away that unit's price and area edits
        // too. Absent means "leave this field alone", which is what the
        // developer meant by typing a dash.
        const status = parseStatusCell(cell);
        if (status !== null) row.status = status;
      } else {
        const n = parseNumericCell(cell);
        // A non-numeric cell in a numeric column stays on the row as the
        // raw string so zod rejects THAT row with a real message, rather
        // than being dropped here and silently syncing as "unchanged".
        row[field] = n ?? cell;
      }
    }
    // A completely blank line (trailing rows are extremely common in real
    // sheets) is skipped, not reported as a missing-code error.
    if (Object.keys(row).length === 0) continue;
    rows.push(row);
    if (rows.length >= SHEET_MAX_ROWS) break;
  }

  return { rows, headers, recognized, ignored };
}

/**
 * RFC-4180 CSV reader — handles quoted fields containing commas, escaped
 * quotes, AND embedded newlines (which Google's export does produce for
 * any cell a human pressed alt+enter inside, e.g. a multi-line notes
 * column sitting next to the price column). The previous line-by-line
 * splitter treated such a cell as a row break, shifting every subsequent
 * column by one — a silent data-corruption path on exactly the kind of
 * annotated sheet real developers keep.
 */
function splitCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  // Strip a UTF-8 BOM — Sheets' CSV export includes one, and it would
  // otherwise become part of the first header ("﻿UNIT").
  const text = csv.replace(/^\uFEFF/, "");

  const endCell = () => {
    row.push(cur);
    cur = "";
  };
  const endRow = () => {
    endCell();
    // Drop rows that are entirely empty cells — trailing blank lines.
    if (row.some((c) => c.trim().length > 0)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) endRow();

  return rows;
}
