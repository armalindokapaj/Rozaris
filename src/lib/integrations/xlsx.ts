import { createZipStream, type ZipEntry } from "@/lib/zipStream";
import { FIELD_HEADER_ALIASES, SYNCABLE_FIELDS, type SyncableField } from "./normalization";

/**
 * Minimal, dependency-free `.xlsx` writer for the Sheet Sync "starter
 * sheet" — one worksheet, inline strings, a bold frozen header row.
 *
 * Why not the CSV this replaced: a comma-separated file only lands in
 * separate columns if the opening application happens to split on commas.
 * Excel splits on the *system list separator*, which is `;` across the
 * European locales this product is sold into (Albanian included), so the
 * starter sheet arrived as a single column of `A-001,120,350000,1,2,6,sold`
 * — the exact bug this replaces. The usual CSV workarounds each break one
 * of the three apps that matter: a `sep=,` directive fixes Excel but shows
 * up as a junk first row in Google Sheets and Numbers, and picking `;`
 * instead just moves the problem to US locales.
 *
 * `.xlsx` has no separator at all — the columns are structural. It opens
 * correctly in Excel in every locale, in Numbers, and in Google Sheets
 * (File → Import → Upload), which is where this file is *going*: the whole
 * point of the starter sheet is to become the developer's Google Sheet.
 * It also carries real types, so PRICE arrives as the number 350000 rather
 * than as text that has to be coerced back later, and it is UTF-8 by
 * construction, so `m²` and Albanian status words survive.
 *
 * Why hand-rolled: the format needed here is five small XML parts in a ZIP
 * container, and the repo already owns a dependency-free store-only ZIP
 * writer (`src/lib/zipStream.ts`, written for the 3D asset bundle). That is
 * a far smaller surface than adding a spreadsheet library for one admin
 * button — the same reasoning `zipStream.ts` itself documents.
 */

/** One inventory row, in `SYNCABLE_FIELDS` order. */
export interface InventoryRowValues {
  code: string;
  area: number;
  price: number;
  bedrooms: number;
  bathrooms: number;
  floor: number;
  status: string;
}

/** Which of the seven columns hold numbers — written as real numeric cells
 * so the sheet can be summed and sorted, not as text. */
const NUMERIC_FIELDS = new Set<SyncableField>(["area", "price", "bedrooms", "bathrooms", "floor"]);

/** Roughly "characters wide", the unit Excel's `<col width>` uses. Sized to
 * the header words, which are the longest thing in most of these columns. */
const COLUMN_WIDTHS: Record<SyncableField, number> = {
  code: 12,
  area: 10,
  price: 14,
  bedrooms: 12,
  bathrooms: 12,
  floor: 8,
  status: 12,
};

/** XML text escaping. Deliberately also escapes `>` — legal either way, and
 * it keeps the output identical whether or not a value sits next to a
 * `]]>` sequence. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** XML 1.0 forbids most control characters outright — no escape exists for
 * them, so a stray one makes the whole workbook unreadable rather than
 * merely ugly. Strip them instead of emitting a corrupt file. */
function xmlSafe(value: string): string {
  return xmlEscape(value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""));
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". Seven columns never reach AA today, but
 * the reference has to be right for the file to parse at all. */
function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const CONTENT_TYPES = `${XML_DECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `${XML_DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `${XML_DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/** Two fonts (normal + bold) and two cell formats (body + header). Excel
 * requires the first two fills to be `none` and `gray125` in that order —
 * a workbook that omits them opens with its styles quietly discarded. */
const STYLES = `${XML_DECL}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Excel's own rules for a tab name: at most 31 characters, and none of
 * `: \ / ? * [ ]`. A workbook that breaks either is rejected as corrupt
 * rather than opened with the name trimmed, so the project name has to be
 * cleaned rather than trusted. */
function safeSheetName(raw: string): string {
  const cleaned = raw.replace(/[:\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  return cleaned || "Inventory";
}

function workbookXml(sheetName: string): string {
  return `${XML_DECL}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlSafe(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function cell(ref: string, value: string | number, header: boolean): string {
  const style = header ? ' s="1"' : "";
  if (typeof value === "number") {
    // Non-finite numbers have no cell representation; fall back to blank
    // rather than writing `NaN`, which makes the file unreadable.
    if (!Number.isFinite(value)) return `<c r="${ref}"${style}/>`;
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  if (value === "") return `<c r="${ref}"${style}/>`;
  // Inline strings rather than a shared-strings part: one fewer part to
  // keep consistent, and inventory codes barely repeat.
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlSafe(value)}</t></is></c>`;
}

function sheetXml(rows: InventoryRowValues[]): string {
  const header = SYNCABLE_FIELDS.map((f) => FIELD_HEADER_ALIASES[f][0]);
  const lastColumn = columnName(SYNCABLE_FIELDS.length - 1);

  const cols = SYNCABLE_FIELDS.map(
    (f, i) => `<col min="${i + 1}" max="${i + 1}" width="${COLUMN_WIDTHS[f]}" customWidth="1"/>`
  ).join("");

  const headerRow = `<row r="1">${header.map((h, i) => cell(`${columnName(i)}1`, h, true)).join("")}</row>`;

  const bodyRows = rows.map((row, r) => {
    const rowNumber = r + 2;
    const cells = SYNCABLE_FIELDS.map((f, i) => {
      const raw = row[f];
      const value = NUMERIC_FIELDS.has(f) ? Number(raw) : String(raw ?? "");
      return cell(`${columnName(i)}${rowNumber}`, value, false);
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  });

  // Child order is fixed by the schema: dimension, sheetViews, sheetFormatPr,
  // cols, sheetData. Out of order, Excel rejects the part outright.
  return `${XML_DECL}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastColumn}${Math.max(rows.length + 1, 1)}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${headerRow}${bodyRows.join("")}</sheetData>
</worksheet>`;
}

/**
 * The starter sheet as a streaming `.xlsx`.
 *
 * `sheetName` is what the tab is called once it lands in Google Sheets —
 * the project's own name, so an admin juggling several developers' sheets
 * can tell them apart.
 */
export function buildInventoryWorkbook(
  rows: InventoryRowValues[],
  sheetName = "Inventory"
): ReadableStream<Uint8Array> {
  const stamp = new Date();
  const encoder = new TextEncoder();
  const part = (name: string, xml: string): ZipEntry => ({
    // NOT run through `zipEntryName()`: that sanitizer strips path
    // separators, and these names are fixed OPC part paths (`xl/…`) with no
    // user input in them at all — the very thing it exists to defend
    // against. Sanitizing here would produce a ZIP that is not a workbook.
    name,
    lastModified: stamp,
    open: async () => {
      const bytes = encoder.encode(xml);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
  });

  return createZipStream([
    part("[Content_Types].xml", CONTENT_TYPES),
    part("_rels/.rels", ROOT_RELS),
    part("xl/workbook.xml", workbookXml(sheetName)),
    part("xl/_rels/workbook.xml.rels", WORKBOOK_RELS),
    part("xl/styles.xml", STYLES),
    part("xl/worksheets/sheet1.xml", sheetXml(rows)),
  ]);
}

/** Excel's own media type — what makes a browser hand the file to a
 * spreadsheet app rather than offering to display it. */
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
