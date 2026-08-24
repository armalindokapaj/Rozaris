import { z } from "zod";

/**
 * Multi-Channel Publishing PRD Phase 8, §21 "Google Sheet structure" +
 * §25 "Never trust Google Sheet input... Validate with Zod before
 * touching Prisma." One row's editable fields — matched against a real
 * `Unit` by `code` (the schema's existing `@@unique([projectId, code])`,
 * not a separate synthetic `UNIT_ID`; the PRD's own example table's
 * `UNIT_ID` column is just a locked, human-legible label, and this app
 * already has a real unique key that does the same job).
 *
 * Scope widened past the PRD's original PRICE/STATUS pair to the five
 * commercial fields a developer actually re-prices a tower on from their
 * own spreadsheet — AREA, PRICE, BEDROOMS, BATHROOMS, FLOOR — plus the
 * pre-existing STATUS. Everything else on `Unit` (code, building, media,
 * orientation, 3D mesh links) stays admin-authored in the console: those
 * are identity/asset fields, and letting an external sheet rewrite a
 * unit's `code` would break the very key this sync matches on.
 *
 * Deliberately narrower than the PRD's own example on status: the 3
 * values every existing Unit write route already validates
 * (available/reserved/sold — see `.../units/[unitId]/route.ts`'s own zod
 * schema), not the PRD's 4th "hidden" value + separate `VISIBLE` boolean
 * column. `Unit` has no backing field for either of those today, and
 * per-channel visibility already exists for a different, more precise
 * purpose (`PublishTargetUnitOverride`, Phase 2/6) — bolting a
 * project-wide "hidden" onto `Unit.status` would need its own real design
 * pass, not a side effect of the sync engine. Flagged rather than forced.
 */
export const inventoryRowSchema = z.object({
  code: z.string().min(1, "Missing unit code."),
  area: z.number().positive("Area must be a positive number.").optional(),
  price: z.number().positive("Price must be a positive number.").optional(),
  bedrooms: z.number().int("Bedrooms must be a whole number.").min(0, "Bedrooms cannot be negative.").max(50, "Bedrooms looks wrong (over 50).").optional(),
  bathrooms: z.number().int("Bathrooms must be a whole number.").min(0, "Bathrooms cannot be negative.").max(50, "Bathrooms looks wrong (over 50).").optional(),
  // No `min` — a basement/garage level is a legitimate negative floor, and
  // ground floor is a legitimate 0.
  floor: z.number().int("Floor must be a whole number.").min(-20, "Floor looks wrong (below -20).").max(200, "Floor looks wrong (over 200).").optional(),
  status: z.enum(["available", "reserved", "sold"], {
    message: "Status must be one of available, reserved, sold.",
  }).optional(),
});

export type InventoryRow = z.infer<typeof inventoryRowSchema>;

/** Every `Unit` column an external sheet is allowed to write, in the order
 * a generated template lays them out. `code` leads and is match-only —
 * never written, since it IS the match key. */
export const SYNCABLE_FIELDS = ["code", "area", "price", "bedrooms", "bathrooms", "floor", "status"] as const;
export type SyncableField = (typeof SYNCABLE_FIELDS)[number];

/** The subset that actually gets written to a `Unit` row (everything but
 * the match key). */
export const WRITABLE_FIELDS = SYNCABLE_FIELDS.filter((f) => f !== "code") as Exclude<SyncableField, "code">[];

/**
 * Header names each field is recognised under, uppercased and stripped of
 * punctuation before comparison (see `normalizeHeader`). First entry is
 * the canonical one a generated template writes. Albanian variants are
 * included because the developers filling these sheets in are local — the
 * whole point of the connector is that they work in their own file, in
 * their own words, and it still lands correctly.
 */
export const FIELD_HEADER_ALIASES: Record<SyncableField, string[]> = {
  code: ["UNIT", "UNIT ID", "UNITID", "UNIT CODE", "CODE", "APARTMENT", "APT", "KODI", "NJESIA", "NJËSIA"],
  area: ["AREA", "AREA M2", "M2", "SQM", "SIZE", "SURFACE", "SIPERFAQE", "SIPËRFAQE"],
  price: ["PRICE", "PRICE EUR", "AMOUNT", "VALUE", "CMIMI", "ÇMIMI"],
  bedrooms: ["BEDROOMS", "BEDROOM", "BEDS", "BED", "BR", "ROOMS", "DHOMA", "DHOMA GJUMI"],
  bathrooms: ["BATHROOMS", "BATHROOM", "BATHS", "BATH", "BA", "WC", "TUALETE", "BANJO"],
  floor: ["FLOOR", "LEVEL", "STOREY", "KATI", "KAT"],
  status: ["STATUS", "AVAILABILITY", "STATUSI", "GJENDJA"],
};

/** Human label per field, for the connector UI's mapping table and the
 * dry-run diff. */
export const FIELD_LABELS: Record<SyncableField, string> = {
  code: "Unit code",
  area: "Area (m²)",
  price: "Price",
  bedrooms: "Bedrooms",
  bathrooms: "Bathrooms",
  floor: "Floor",
  status: "Status",
};

/** Uppercase + collapse anything that isn't a letter or digit, so
 * `"Price (EUR)"`, `"PRICE_EUR"` and `"price eur"` all compare equal.
 * Accents are stripped too (`ÇMIMI` -> `CMIMI`) so a developer's own
 * Albanian header matches with or without them. */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

const NORMALIZED_ALIASES: Record<SyncableField, string[]> = Object.fromEntries(
  (Object.entries(FIELD_HEADER_ALIASES) as [SyncableField, string[]][]).map(([field, aliases]) => [
    field,
    aliases.map(normalizeHeader),
  ])
) as Record<SyncableField, string[]>;

/** Which syncable field (if any) a sheet header names. `columnMapping`
 * (stored per connector) wins over the built-in aliases, so a sheet whose
 * column is called something this list has never heard of ("SHITJA
 * FUNDIT") can still be pointed at a field by hand from the admin UI. */
export function matchHeaderToField(
  header: string,
  columnMapping?: Record<string, string> | null
): SyncableField | null {
  const normalized = normalizeHeader(header);
  if (columnMapping) {
    for (const [sheetHeader, field] of Object.entries(columnMapping)) {
      if (normalizeHeader(sheetHeader) === normalized && (SYNCABLE_FIELDS as readonly string[]).includes(field)) {
        return field as SyncableField;
      }
    }
  }
  for (const field of SYNCABLE_FIELDS) {
    if (NORMALIZED_ALIASES[field].includes(normalized)) return field;
  }
  return null;
}

/**
 * A number as a human typed it into a spreadsheet cell — `"€ 125,000"`,
 * `"125.000"`, `"1 250,50"`, `"78.5 m²"` — into a real number, or `null`
 * if the cell holds nothing numeric at all.
 *
 * The previous implementation (`replace(/[^0-9.]/g, "")`) silently turned
 * the European `"125.000"` into `125` — a €125,000 apartment re-priced to
 * €125 by a sync nobody would have questioned. Separator handling now:
 *
 * - Both `.` and `,` present -> whichever comes LAST is the decimal
 *   separator, the other is the thousands separator (`1.250,50` = 1250.5,
 *   `1,250.50` = 1250.5).
 * - One separator, appearing more than once -> thousands (`1.250.000`).
 * - One separator, once, followed by EXACTLY 3 digits -> thousands
 *   (`125,000` = 125000, `1.500` = 1500). Formally ambiguous — `1.500`
 *   is 1500 in Tirana and 1.5 in a US-locale CSV export — but resolved
 *   toward thousands deliberately: across these five fields (price, area,
 *   bedrooms, bathrooms, floor) a value authored to exactly 3 decimal
 *   places does not occur, while comma/dot thousands grouping is how
 *   every developer here writes a price. Getting this backwards is the
 *   difference between a €125,000 apartment and a €125 one.
 * - Otherwise -> decimal (`78.5`, `64,25`).
 *
 * The dry-run preview shows every parsed value next to the current one
 * before anything is written, so an unusual sheet is caught by eye rather
 * than by a heuristic having to be perfect.
 */
export function parseNumericCell(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,\-]/g, "").trim();
  if (!cleaned || !/[0-9]/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const digitsOnly = cleaned.replace(/-/g, "");

  const lastDot = digitsOnly.lastIndexOf(".");
  const lastComma = digitsOnly.lastIndexOf(",");
  let normalized: string;

  if (lastDot !== -1 && lastComma !== -1) {
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandsSep = decimalSep === "." ? "," : ".";
    normalized = digitsOnly.split(thousandsSep).join("").replace(decimalSep, ".");
  } else {
    const sep = lastDot !== -1 ? "." : lastComma !== -1 ? "," : null;
    if (!sep) {
      normalized = digitsOnly;
    } else {
      const occurrences = digitsOnly.split(sep).length - 1;
      const trailing = digitsOnly.length - digitsOnly.lastIndexOf(sep) - 1;
      const isThousands = occurrences > 1 || trailing === 3;
      normalized = isThousands ? digitsOnly.split(sep).join("") : digitsOnly.replace(sep, ".");
    }
  }

  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

/** Status words a developer's own sheet is likely to hold, mapped onto
 * the 3 values `Unit.status` actually accepts. Anything else falls
 * through to the zod enum and is rejected with a row-level error, never
 * silently coerced to "available". */
const STATUS_ALIASES: Record<string, "available" | "reserved" | "sold"> = {
  AVAILABLE: "available",
  FREE: "available",
  OPEN: "available",
  LIRE: "available",
  I_LIRE: "available",
  DISPONUESHEM: "available",
  RESERVED: "reserved",
  RESERVATION: "reserved",
  HELD: "reserved",
  ON_HOLD: "reserved",
  REZERVUAR: "reserved",
  I_REZERVUAR: "reserved",
  SOLD: "sold",
  SOLD_OUT: "sold",
  CLOSED: "sold",
  SHITUR: "sold",
  I_SHITUR: "sold",
};

export function parseStatusCell(raw: string): string | null {
  const key = normalizeHeader(raw).replace(/ /g, "_");
  if (!key) return null;
  // Unmapped words are returned as-is (lowercased) so the zod enum — not
  // this table — produces the row's rejection message.
  return STATUS_ALIASES[key] ?? raw.trim().toLowerCase();
}

/** What a connector's fetch step (Google Sheets, a future CRM API, or a
 * manual admin-supplied array) produces — untyped/untrusted until it goes
 * through `inventoryRowSchema` inside the sync engine. */
export type RawInventoryRow = Record<string, unknown>;
