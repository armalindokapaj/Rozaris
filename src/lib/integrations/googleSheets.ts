import {
  FIELD_HEADER_ALIASES,
  SYNCABLE_FIELDS,
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
export async function fetchGoogleSheet(
  sheetId: string,
  gid = "0",
  columnMapping?: Record<string, string> | null
): Promise<SheetParseResult> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const res = await fetch(url, { cache: "no-store" });
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
  const csv = await res.text();
  return parseInventoryCsv(csv, columnMapping);
}

/** Back-compat shape for callers that only want the rows. */
export async function fetchGoogleSheetRows(
  sheetId: string,
  gid = "0",
  columnMapping?: Record<string, string> | null
): Promise<RawInventoryRow[]> {
  return (await fetchGoogleSheet(sheetId, gid, columnMapping)).rows;
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
export function parseInventoryCsv(
  csv: string,
  columnMapping?: Record<string, string> | null
): SheetParseResult {
  const lines = splitCsvRows(csv);
  if (lines.length === 0) {
    return { rows: [], headers: [], recognized: {}, ignored: [] };
  }

  const headers = lines[0].map((h) => h.trim());
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
  for (const cells of lines.slice(1)) {
    const row: RawInventoryRow = {};
    for (const [index, field] of fieldByIndex) {
      const cell = (cells[index] ?? "").trim();
      if (!cell) continue; // empty cell == "leave this field alone"
      if (field === "code") {
        row.code = cell;
      } else if (field === "status") {
        row.status = parseStatusCell(cell);
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
  }

  return { rows, headers, recognized, ignored };
}

/**
 * The starter sheet an admin hands the developer — this project's real,
 * current inventory, in exactly the columns the sync reads back. Beats
 * "here are the column names, go build it": the developer opens a file
 * that already matches their tower and edits numbers in place, so unit
 * codes can't drift out of sync with the ones the match step needs.
 */
export function buildSheetTemplateCsv(
  units: {
    code: string;
    area: number;
    price: number;
    bedrooms: number;
    bathrooms: number;
    floor: number;
    status: string;
  }[]
): string {
  const header = SYNCABLE_FIELDS.map((f) => FIELD_HEADER_ALIASES[f][0]);
  const body = units.map((u) =>
    SYNCABLE_FIELDS.map((f) => csvCell(String(u[f as keyof typeof u] ?? ""))).join(",")
  );
  return [header.join(","), ...body].join("\r\n");
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
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
