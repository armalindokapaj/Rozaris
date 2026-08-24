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
 * 11 (idempotency) — same `sourceHash` as the connector's last successful
 *    run short-circuits before touching a single Unit row.
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

  // Idempotency (step 11) is a real-run concern only — a dry run must
  // always recompute and show the diff, even when the sheet is byte-for-
  // byte what it was at the last sync (that's the normal case when an
  // admin opens the panel to check).
  if (!dryRun) {
    const lastGoodRun = await prisma.inventorySyncRun.findFirst({
      where: { connectorId, status: { in: ["success", "partial"] } },
      orderBy: { startedAt: "desc" },
    });
    if (lastGoodRun && lastGoodRun.sourceHash === sourceHash) {
      const run = await prisma.inventorySyncRun.create({
        data: {
          connectorId,
          status: "success",
          sourceHash,
          rowsRead: rows.length,
          rowsChanged: 0,
          rowsRejected: 0,
          startedAt,
          finishedAt: new Date(),
        },
      });
      await prisma.inventoryConnector.update({
        where: { id: connectorId },
        data: { lastSyncAt: new Date(), lastSuccessfulSyncAt: new Date(), status: "active" },
      });
      return {
        syncRunId: run.id,
        dryRun: false,
        status: "success",
        rowsRead: rows.length,
        rowsChanged: 0,
        rowsRejected: 0,
        rowsUnchanged: rows.length,
        errors: [],
        changes: [],
      };
    }
  }

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

  const rowsChanged = changes.length;
  const status: SyncResult["status"] = errors.length === 0 ? "success" : rowsChanged > 0 ? "partial" : "error";

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
      ...(status !== "error" ? { lastSuccessfulSyncAt: new Date() } : {}),
      // Clear a previous `error` state on a run that worked, not just set
      // one on a run that didn't — otherwise a connector that failed once
      // (bad share setting, since fixed) reads as broken forever.
      status: status === "error" ? "error" : "active",
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
