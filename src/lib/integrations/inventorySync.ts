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
  syncRunId: string | null;
  dryRun: boolean;
  status: "success" | "partial" | "error";
  rowsRead: number;
  rowsChanged: number;
  rowsRejected: number;
  rowsUnchanged: number;
  errors: SyncRowError[];
  changes: SyncRowChange[];
}

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

  const units = await prisma.unit.findMany({ where: { projectId: connector.projectId, deletedAt: null } });
  const unitByCode = new Map<string, (typeof units)[number]>();
  for (const u of units) {
    const key = u.code.trim().toLowerCase();
    if (!unitByCode.has(key)) unitByCode.set(key, u);
  }

  const errors: SyncRowError[] = [];
  const changes: SyncRowChange[] = [];
  let rowsUnchanged = 0;
  const seenCodes = new Set<string>();

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
        if (next === undefined) continue;
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
