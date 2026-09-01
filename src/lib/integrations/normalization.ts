import { z } from "zod";

export const inventoryRowSchema = z.object({
  code: z.string().min(1, "Missing unit code."),
  area: z.number().positive("Area must be a positive number.").optional(),
  price: z.number().positive("Price must be a positive number.").optional(),
  bedrooms: z.number().int("Bedrooms must be a whole number.").min(0, "Bedrooms cannot be negative.").max(50, "Bedrooms looks wrong (over 50).").optional(),
  bathrooms: z.number().int("Bathrooms must be a whole number.").min(0, "Bathrooms cannot be negative.").max(50, "Bathrooms looks wrong (over 50).").optional(),
  floor: z.number().int("Floor must be a whole number.").min(-20, "Floor looks wrong (below -20).").max(200, "Floor looks wrong (over 200).").optional(),
  status: z.enum(["available", "reserved", "sold"], {
    message: "Status must be one of available, reserved, sold.",
  }).optional(),
});

export type InventoryRow = z.infer<typeof inventoryRowSchema>;

export const SYNCABLE_FIELDS = ["code", "area", "price", "bedrooms", "bathrooms", "floor", "status"] as const;
export type SyncableField = (typeof SYNCABLE_FIELDS)[number];

export const WRITABLE_FIELDS = SYNCABLE_FIELDS.filter((f) => f !== "code") as Exclude<SyncableField, "code">[];

export const FIELD_HEADER_ALIASES: Record<SyncableField, string[]> = {
  code: ["UNIT", "UNIT ID", "UNITID", "UNIT CODE", "CODE", "APARTMENT", "APT", "KODI", "NJESIA", "NJËSIA"],
  area: ["AREA", "AREA M2", "M2", "SQM", "SIZE", "SURFACE", "SIPERFAQE", "SIPËRFAQE"],
  price: ["PRICE", "PRICE EUR", "AMOUNT", "VALUE", "CMIMI", "ÇMIMI"],
  bedrooms: ["BEDROOMS", "BEDROOM", "BEDS", "BED", "BR", "ROOMS", "DHOMA", "DHOMA GJUMI"],
  bathrooms: ["BATHROOMS", "BATHROOM", "BATHS", "BATH", "BA", "WC", "TUALETE", "BANJO"],
  floor: ["FLOOR", "LEVEL", "STOREY", "KATI", "KAT"],
  status: ["STATUS", "AVAILABILITY", "STATUSI", "GJENDJA"],
};

export const FIELD_LABELS: Record<SyncableField, string> = {
  code: "Unit code",
  area: "Area (m²)",
  price: "Price",
  bedrooms: "Bedrooms",
  bathrooms: "Bathrooms",
  floor: "Floor",
  status: "Status",
};

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

export const IGNORE_COLUMN = "__ignore__";

export type ColumnMappingValue = SyncableField | typeof IGNORE_COLUMN;

export const COLUMN_MAPPING_VALUES = [...SYNCABLE_FIELDS, IGNORE_COLUMN] as const;

export function matchHeaderToField(
  header: string,
  columnMapping?: Record<string, string> | null
): SyncableField | null {
  const normalized = normalizeHeader(header);
  if (columnMapping) {
    for (const [sheetHeader, field] of Object.entries(columnMapping)) {
      if (normalizeHeader(sheetHeader) !== normalized) continue;
      if (field === IGNORE_COLUMN) return null;
      if ((SYNCABLE_FIELDS as readonly string[]).includes(field)) return field as SyncableField;
    }
  }
  for (const field of SYNCABLE_FIELDS) {
    if (NORMALIZED_ALIASES[field].includes(normalized)) return field;
  }
  return null;
}

export function parseNumericCell(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,\-]/g, "").trim();
  if (!cleaned || !/[0-9]/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const digitsOnly = cleaned.replace(/^-/, "");
  if (digitsOnly.includes("-")) return null;

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
  return STATUS_ALIASES[key] ?? raw.trim().toLowerCase();
}

export type RawInventoryRow = Record<string, unknown>;
