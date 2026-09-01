import {
  FIELD_HEADER_ALIASES,
  matchHeaderToField,
  parseNumericCell,
  parseStatusCell,
  type RawInventoryRow,
  type SyncableField,
} from "./normalization";

export class SheetParseError extends Error {
  readonly headers: string[];
  constructor(message: string, headers: string[] = []) {
    super(message);
    this.name = "SheetParseError";
    this.headers = headers;
  }
}

export interface SheetParseResult {
  rows: RawInventoryRow[];
  headers: string[];
  recognized: Record<string, SyncableField>;
  ignored: string[];
}

export interface SheetRef {
  sheetId: string;
  gid: string;
}

export function parseSheetRef(input: string): SheetRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]{20,})/);
  if (urlMatch) {
    const gidMatch = trimmed.match(/[#?&]gid=([0-9]+)/);
    return { sheetId: urlMatch[1], gid: gidMatch?.[1] ?? "0" };
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return { sheetId: trimmed, gid: "0" };
  }
  return null;
}

export function sheetEditUrl(sheetId: string, gid = "0"): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}`;
}

const SHEET_FETCH_TIMEOUT_MS = 15_000;
const SHEET_MAX_BYTES = 8 * 1024 * 1024;
export const SHEET_MAX_ROWS = 5000;

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
    throw new Error('This Google Sheet is not publicly viewable — share it as "Anyone with the link can view" and retry.');
  }
  const csv = await readCapped(res);
  return parseInventoryCsv(csv, columnMapping);
}

const HEADER_SCAN_ROWS = 10;

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

  const headerRowIndex = findHeaderRow(lines, columnMapping);
  const headers = lines[headerRowIndex].map((h) => h.trim());
  const recognized: Record<string, SyncableField> = {};
  const ignored: string[] = [];
  const fieldByIndex = new Map<number, SyncableField>();

  headers.forEach((header, index) => {
    if (!header) return;
    const field = matchHeaderToField(header, columnMapping);
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
      if (!cell) continue;
      if (field === "code") {
        row.code = cell;
      } else if (field === "status") {
        const status = parseStatusCell(cell);
        if (status !== null) row.status = status;
      } else {
        const n = parseNumericCell(cell);
        row[field] = n ?? cell;
      }
    }
    if (Object.keys(row).length === 0) continue;
    rows.push(row);
    if (rows.length >= SHEET_MAX_ROWS) break;
  }

  return { rows, headers, recognized, ignored };
}

function splitCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const text = csv.replace(/^\uFEFF/, "");

  const endCell = () => {
    row.push(cur);
    cur = "";
  };
  const endRow = () => {
    endCell();
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
