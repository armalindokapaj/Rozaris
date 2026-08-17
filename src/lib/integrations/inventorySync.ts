import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { logAuditEvent } from "@/lib/audit";
import { bumpInventoryRevision } from "@/lib/publishing/inventoryRevision";
import { inventoryRowSchema, type RawInventoryRow } from "./normalization";

export interface SyncRowError {
  code: string;
  reason: string;
}

export interface SyncResult {
  syncRunId: string;
  status: "success" | "partial" | "error";
  rowsRead: number;
  rowsChanged: number;
  rowsRejected: number;
  errors: SyncRowError[];
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
 * PRD §56 "Unknown Unit ID": rejected, never creates a surprise Unit.
 * "Missing release asset"/"active release asset deletion" don't apply
 * here (that's the 3D pipeline, not inventory).
 */
export async function runInventorySync(
  connectorId: string,
  rows: RawInventoryRow[],
  actor: string
): Promise<SyncResult> {
  const connector = await prisma.inventoryConnector.findUnique({ where: { id: connectorId } });
  if (!connector) {
    throw new Error("Connector not found.");
  }

  const startedAt = new Date();
  const sourceHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");

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
      data: { lastSyncAt: new Date(), lastSuccessfulSyncAt: new Date() },
    });
    return { syncRunId: run.id, status: "success", rowsRead: rows.length, rowsChanged: 0, rowsRejected: 0, errors: [] };
  }

  const units = await prisma.unit.findMany({ where: { projectId: connector.projectId, deletedAt: null } });
  const unitByCode = new Map(units.map((u) => [u.code, u]));

  const errors: SyncRowError[] = [];
  let rowsChanged = 0;

  for (const raw of rows) {
    const parsed = inventoryRowSchema.safeParse(raw);
    if (!parsed.success) {
      const codeGuess = typeof raw.code === "string" ? raw.code : "?";
      errors.push({ code: codeGuess, reason: parsed.error.issues[0]?.message ?? "Invalid row." });
      continue;
    }

    const unit = unitByCode.get(parsed.data.code);
    if (!unit) {
      errors.push({ code: parsed.data.code, reason: `No unit with code "${parsed.data.code}" in this project.` });
      continue;
    }

    const patch: { price?: number; status?: string } = {};
    if (parsed.data.price !== undefined && parsed.data.price !== unit.price) patch.price = parsed.data.price;
    if (parsed.data.status !== undefined && parsed.data.status !== unit.status) patch.status = parsed.data.status;
    if (Object.keys(patch).length === 0) continue;

    await prisma.unit.update({ where: { id: unit.id }, data: patch });
    rowsChanged++;
  }

  if (rowsChanged > 0) {
    await bumpInventoryRevision(connector.projectId);
  }

  const status: SyncResult["status"] = errors.length === 0 ? "success" : rowsChanged > 0 ? "partial" : "error";

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
      ...(status === "error" ? { status: "error" } : {}),
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
    },
  });

  return { syncRunId: run.id, status, rowsRead: rows.length, rowsChanged, rowsRejected: errors.length, errors };
}
