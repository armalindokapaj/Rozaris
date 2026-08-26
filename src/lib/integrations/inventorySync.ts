import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { logAuditEvent } from "@/lib/audit";
import { bumpInventoryRevision } from "@/lib/publishing/inventoryRevision";
import {
  WRITABLE_FIELDS,
  inventoryRowSchema,
  type RawInventoryRow,
} from "./normalization";

export interface SyncRowError {
  code: string;
  reason: string;
}

/** One field a row would change (dry run) or did change (real run). */
export interface SyncFieldChange {
  field: string;
  from: string | number | null;
  to: string | number;
}

export interface SyncRowChange {
  code: string;
  unitId: string;
  changes: SyncFieldChange[];
}

export interface SyncResult {
  /** Null on a dry run — nothing was written, so no run row exists. */
  syncRunId: string | null;
  dryRun: boolean;
  status: "success" | "partial" | "error";
  rowsRead: number;
  rowsChanged: number;
  rowsRejected: number;
  /** Rows matched and valid but identical to what's already stored. */
  rowsUnchanged: number;
  errors: SyncRowError[];
  /** Per-unit field diff — what a dry run is FOR, and worth returning on a
   * real run too so the UI can say "A-101 price 120,000 -> 128,500"
   * instead of a bare "3 rows changed". */
  changes: SyncRowChange[];
}

/**
 * Multi-Channel Publishing PRD Phase 8, §24 "Sync transaction logic" +
 * §56 "Failure handling". The one engine every `InventoryConnector` type
 * shares — `google_sheets`/`api`/`manual` all differ only in how `rows`
 * got produced, never in how they're applied. Deliberately provider-
 * agnostic for exactly that reason: a future CRM/API connector needs zero
 * changes here, only its own fetch step.
 *
 * Steps, matching the PRD's own numbered list:
 * 1-2 (fetch/normalize) — done by the caller before this runs.
 * 3 (match UNIT_ID) — by `code`, within this connector's project only.
 * 4 (validate) — `inventoryRowSchema`, one row at a time; a bad row is
 *    rejected and logged, never thrown (one malformed row shouldn't sink
 *    the other 183 — PRD §23's own worked example).
 * 5-6 (detect/write changes) — only actually writes a field that
 *    genuinely differs from the current value; a row identical to what's
 *    already stored costs zero writes.
 * 7 (bump revision) — once, if anything changed at all, not per-row.
 * 8-9 (sync run + audit) — always, even on a run that changed nothing.
 * 10 (invalidate inventory cache) — implicit: revision bump IS the cache
 *    invalidation signal the public `/inventory` endpoint's ETag reads.
 * 11 (idempotency) — falls out of the per-row diff, not out of a hash: a
 *    sheet identical to what is already stored produces zero field
 *    changes and therefore zero writes. `sourceHash` is recorded on each
 *    run as provenance only; it deliberately does NOT gate the write (see
 *    the note in the body for what that cost).
 *
 * `dryRun` runs steps 3-4 and the change DETECTION half of 5-6, then stops
 * — no Unit write, no revision bump, no sync-run row, no audit entry. It
 * exists because "this sheet is about to reprice 41 apartments" is
 * something an admin must be able to read BEFORE it happens, not
 * reconstruct from the audit log afterwards.
 *
 * PRD §56 "Unknown Unit ID": rejected, never creates a surprise Unit.
 * "Missing release asset"/"active release asset deletion" don't apply
 * here (that's the 3D pipeline, not inventory).
 */
export async function runInventorySync(
  connectorId: string,
  rows: RawInventoryRow[],
  actor: string,
  options: { dryRun?: boolean } = {}
): Promise<SyncResult> {
  const dryRun = options.dryRun === true;
  const connector = await prisma.inventoryConnector.findUnique({ where: { id: connectorId } });
  if (!connector) {
    throw new Error("Connector not found.");
  }

  const startedAt = new Date();
  const sourceHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");

  // NO source-hash short-circuit. `sourceHash` is still recorded on the
  // run below as provenance ("was this the same sheet as last time?"), but
  // it must never gate the WRITE, because it is computed from the sheet
  // alone and therefore cannot see the thing that actually matters: whether
  // the units have drifted away from it. Every path that edits a Unit
  // outside the sheet — the grid in this very section, the Inventory table,
  // the bulk reprice — desynchronised the DB without changing the hash, and
  // from then on "Sync now" and "Apply changes" reported a cheerful
  // "success, 0 changed" while writing nothing at all, forever. The preview
  // (computed against real Unit rows) and the real run (gated on the hash)
  // disagreed by construction.
  //
  // Nothing is lost by dropping it: the expensive step, fetching the CSV,
  // already happened in the route before this function is entered, and the
  // per-row diff below is what actually makes a sync idempotent — an
  // unchanged sheet produces zero field changes, so zero `unit.update`
  // calls and no revision bump. Pressing "Sync now" twice was already safe.

  const units = await prisma.unit.findMany({ where: { projectId: connector.projectId, deletedAt: null } });
  // Matched case-insensitively and whitespace-trimmed: "a-101" typed into
  // a sheet is unmistakably unit "A-101", and rejecting it as unknown
  // would be pedantry, not data safety. Codes are unique per project
  // (@@unique([projectId, code])), so the only way this collides is a
  // project that already holds both "A-101" and "a-101" — first row wins
  // and the second is left addressable only by its exact case.
  const unitByCode = new Map<string, (typeof units)[number]>();
  for (const u of units) {
    const key = u.code.trim().toLowerCase();
    if (!unitByCode.has(key)) unitByCode.set(key, u);
  }

  const errors: SyncRowError[] = [];
  const changes: SyncRowChange[] = [];
  let rowsUnchanged = 0;
  const seenCodes = new Set<string>();

  // A real run writes unit-by-unit rather than inside one transaction: a
  // 500-row sheet in a single interactive transaction would hold a
  // Postgres connection for the whole run and hit the transaction timeout
  // long before the sheet ran out. The cost of that choice is that a
  // failure halfway leaves the rows before it already written — so the one
  // thing that must not ALSO fail is saying so. Without this catch a
  // mid-loop throw propagated straight out and the run left no sync-run
  // row, no audit entry and no revision bump: real writes that nothing in
  // the app could see, explain, or even know had happened.
  try {
    for (const raw of rows) {
      const parsed = inventoryRowSchema.safeParse(raw);
      if (!parsed.success) {
        const codeGuess = typeof raw.code === "string" ? raw.code : "?";
        const issue = parsed.error.issues[0];
        const field = issue?.path?.[0];
        errors.push({
          code: codeGuess,
          reason: field && field !== "code" ? `${String(field)}: ${issue.message}` : (issue?.message ?? "Invalid row."),
        });
        continue;
      }

      const key = parsed.data.code.trim().toLowerCase();
      if (seenCodes.has(key)) {
        // A duplicated unit code inside one sheet is a data-entry mistake
        // with two different intents behind it — last-write-wins would
        // apply whichever row happened to be lower in the file. Reject the
        // repeat and say so.
        errors.push({ code: parsed.data.code, reason: "Duplicate row — this unit code appears more than once in the sheet." });
        continue;
      }
      seenCodes.add(key);

      const unit = unitByCode.get(key);
      if (!unit) {
        errors.push({ code: parsed.data.code, reason: `No unit with code "${parsed.data.code}" in this project.` });
        continue;
      }

      const patch: Record<string, number | string> = {};
      const rowChanges: SyncFieldChange[] = [];
      for (const field of WRITABLE_FIELDS) {
        const next = parsed.data[field];
        if (next === undefined) continue; // column absent, or cell blank
        const current = unit[field] as number | string;
        if (next === current) continue;
        patch[field] = next;
        rowChanges.push({ field, from: current ?? null, to: next });
      }

      if (rowChanges.length === 0) {
        rowsUnchanged++;
        continue;
      }

      changes.push({ code: unit.code, unitId: unit.id, changes: rowChanges });

      if (!dryRun) {
        await prisma.unit.update({
          where: { id: unit.id },
          // `revision` is Unit's optimistic-concurrency counter (PRD §57),
          // inert until now — the sync engine is its first real writer, so
          // an external sheet overwriting a value an admin edited in the
          // console a second earlier is at least visible after the fact.
          data: { ...patch, revision: { increment: 1 } },
        });
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error.";
    if (!dryRun) {
      if (changes.length > 0) await bumpInventoryRevision(connector.projectId);
      await prisma.inventorySyncRun.create({
        data: {
          connectorId,
          status: "error",
          sourceHash,
          rowsRead: rows.length,
          rowsChanged: changes.length,
          rowsRejected: errors.length,
          errors: [
            ...errors,
            { code: "\u2014", reason: `Sync stopped part-way after ${changes.length} unit(s): ${reason}` },
          ] as unknown as Prisma.InputJsonValue,
          startedAt,
          finishedAt: new Date(),
        },
      });
      await prisma.inventoryConnector.update({
        where: { id: connectorId },
        data: { lastSyncAt: new Date(), status: "error" },
      });
      await logAuditEvent({
        actor,
        action: "Inventory sync failed",
        entityType: "InventoryConnector",
        entityId: connectorId,
        entityLabel: `${connector.type} sync`,
        metadata: { projectId: connector.projectId, rowsWrittenBeforeFailure: changes.length, reason },
      });
    }
    throw err;
  }

  const rowsChanged = changes.length;
  // "partial" whenever some rows were rejected, regardless of whether the
  // survivors happened to change anything. Keying this off `rowsChanged`
  // meant a sheet that was already fully applied, but still carried one
  // row for a unit that does not exist, came back as "error" and badged the
  // whole connector red — a permanent red light for a sheet that is
  // working. A run that got this far READ the sheet successfully; only the
  // fetch/parse step can fail the connector, and that is handled by the
  // route.
  const status: SyncResult["status"] = errors.length === 0 ? "success" : "partial";

  if (dryRun) {
    return {
      syncRunId: null,
      dryRun: true,
      status,
      rowsRead: rows.length,
      rowsChanged,
      rowsRejected: errors.length,
      rowsUnchanged,
      errors,
      changes,
    };
  }

  if (rowsChanged > 0) {
    await bumpInventoryRevision(connector.projectId);
  }

  const run = await prisma.inventorySyncRun.create({
    data: {
      connectorId,
      status,
      sourceHash,
      rowsRead: rows.length,
      rowsChanged,
      rowsRejected: errors.length,
      errors: errors.length > 0 ? (errors as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      startedAt,
      finishedAt: new Date(),
    },
  });

  await prisma.inventoryConnector.update({
    where: { id: connectorId },
    data: {
      lastSyncAt: new Date(),
      lastSuccessfulSyncAt: new Date(),
      // Reaching this line means the sheet was fetched, parsed and applied,
      // so the CONNECTOR is healthy even if some of its rows were not —
      // per-row rejections belong in the run record, which carries them.
      // Setting `active` unconditionally here is also what clears a
      // previous `error` state: a connector that failed once on a share
      // setting since fixed must not read as broken forever.
      status: "active",
    },
  });

  await logAuditEvent({
    actor,
    action: "Inventory sync run",
    entityType: "InventoryConnector",
    entityId: connectorId,
    entityLabel: `${connector.type} sync`,
    metadata: {
      projectId: connector.projectId,
      syncRunId: run.id,
      rowsRead: rows.length,
      rowsChanged,
      rowsRejected: errors.length,
      // The actual field-level diff, so the audit log answers "who
      // repriced A-044 and to what" without a separate lookup.
      changes: changes.slice(0, 200) as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    syncRunId: run.id,
    dryRun: false,
    status,
    rowsRead: rows.length,
    rowsChanged,
    rowsRejected: errors.length,
    rowsUnchanged,
    errors,
    changes,
  };
}
