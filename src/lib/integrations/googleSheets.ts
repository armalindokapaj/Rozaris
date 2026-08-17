import type { RawInventoryRow } from "./normalization";

/**
 * Multi-Channel Publishing PRD Phase 8, §20 "Google Sheets architecture" —
 * fetches a Sheet via its public CSV export URL
 * (`docs.google.com/spreadsheets/d/{id}/export?format=csv`), which needs
 * NO credential at all as long as the sheet is shared "Anyone with the
 * link can view" — the PRD's "Simple client" tier (§6). This is real,
 * working code, not a stub — but it has never been run against an actual
 * live Google Sheet in this environment: doing that would mean creating
 * and publicly link-sharing a file in the user's real Google Drive to
 * test against, which wasn't asked for and isn't something to do without
 * checking first, and the only Drive tool available here can share with a
 * specific email address, not "anyone with a link," so it couldn't have
 * produced a fetchable URL anyway. Same honesty as `rateLimit.ts`'s "no
 * real distributed store" and `verification.ts`'s "no real KYC" —
 * flagged, not hidden.
 *
 * The "Professional"/"Enterprise" tiers (§6 — private sheets via real
 * OAuth/service-account auth against the Sheets API v4) are NOT
 * implemented — this environment has no Google Cloud credential to build
 * or test that against.
 */
export async function fetchGoogleSheetRows(sheetId: string, gid = "0"): Promise<RawInventoryRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const res = await fetch(url);
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
  return parseInventoryCsv(csv);
}

/**
 * PRD §21's sheet structure: `UNIT` (matched against `Unit.code`),
 * `PRICE`, `STATUS` columns, header row required, column order
 * irrelevant (matched by header name, uppercased). Unknown/extra columns
 * are ignored, not rejected — a sheet a client has customized with their
 * own extra notes column shouldn't break the sync.
 */
export function parseInventoryCsv(csv: string): RawInventoryRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toUpperCase());
  const codeIdx = header.indexOf("UNIT");
  const priceIdx = header.indexOf("PRICE");
  const statusIdx = header.indexOf("STATUS");
  if (codeIdx === -1) {
    throw new Error('Sheet is missing a "UNIT" column.');
  }

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: RawInventoryRow = { code: (cells[codeIdx] ?? "").trim() };
    if (priceIdx !== -1 && cells[priceIdx]?.trim()) {
      const n = Number(cells[priceIdx].replace(/[^0-9.]/g, ""));
      if (!Number.isNaN(n)) row.price = n;
    }
    if (statusIdx !== -1 && cells[statusIdx]?.trim()) {
      row.status = cells[statusIdx].trim().toLowerCase();
    }
    return row;
  });
}

/** Minimal RFC-4180-ish CSV line splitter — handles quoted fields with
 * embedded commas/escaped quotes, which Google's CSV export does produce
 * for any cell containing a comma. Not a full CSV parser (no embedded
 * newlines inside a quoted cell) — sufficient for the flat UNIT/PRICE/
 * STATUS structure this connector expects. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}
