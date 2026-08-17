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
 * Deliberately narrower than the PRD's own example: `status` is the 3
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
  price: z.number().positive("Price must be a positive number.").optional(),
  status: z.enum(["available", "reserved", "sold"], {
    message: "Status must be one of available, reserved, sold.",
  }).optional(),
});

export type InventoryRow = z.infer<typeof inventoryRowSchema>;

/** What a connector's fetch step (Google Sheets, a future CRM API, or a
 * manual admin-supplied array) produces — untyped/untrusted until it goes
 * through `inventoryRowSchema` inside the sync engine. */
export type RawInventoryRow = Record<string, unknown>;
