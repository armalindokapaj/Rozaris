import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logApiError } from "@/lib/apiErrorLog";
import { runInventorySync } from "@/lib/integrations/inventorySync";
import { fetchGoogleSheet, SheetParseError } from "@/lib/integrations/googleSheets";
import type { RawInventoryRow, SyncableField } from "@/lib/integrations/normalization";

const syncBodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { connectorId } = await params;
  const connector = await prisma.inventoryConnector.findUnique({ where: { id: connectorId } });
  if (!connector) {
    return NextResponse.json({ error: "Connector not found." }, { status: 404 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const body = syncBodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const dryRun = body.data.dryRun === true || new URL(request.url).searchParams.get("dryRun") === "1";

  if (connector.status === "paused" && !dryRun) {
    return NextResponse.json({ error: "This connector is paused — resume it before syncing." }, { status: 409 });
  }

  let rows: RawInventoryRow[];
  let sheetMeta: { headers: string[]; recognized: Record<string, SyncableField>; ignored: string[] } | null = null;

  if (connector.type === "manual") {
    if (!body.data.rows) {
      return NextResponse.json({ error: "A manual connector needs `rows` in the request body." }, { status: 400 });
    }
    rows = body.data.rows;
  } else if (connector.type === "google_sheets") {
    if (!connector.externalResourceId) {
      return NextResponse.json({ error: "This connector has no Google Sheet linked." }, { status: 400 });
    }
    const gid = (connector.configuration as { gid?: string } | null)?.gid ?? "0";
    try {
      const parsedSheet = await fetchGoogleSheet(
        connector.externalResourceId,
        gid,
        connector.columnMapping as Record<string, string> | null
      );
      rows = parsedSheet.rows;
      sheetMeta = {
        headers: parsedSheet.headers,
        recognized: parsedSheet.recognized,
        ignored: parsedSheet.ignored,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Sheet fetch failed.";
      if (!dryRun) {
        await prisma.inventoryConnector.update({
          where: { id: connectorId },
          data: { status: "error", lastSyncAt: new Date() },
        });
        await prisma.inventorySyncRun.create({
          data: {
            connectorId,
            status: "error",
            rowsRead: 0,
            rowsChanged: 0,
            rowsRejected: 0,
            errors: [{ code: "\u2014", reason }] as unknown as Prisma.InputJsonValue,
            startedAt: new Date(),
            finishedAt: new Date(),
          },
        });
        await logApiError(`/api/admin/inventory-connectors/${connectorId}/sync`, err, actor);
      }
      if (err instanceof SheetParseError) {
        return NextResponse.json(
          {
            error: err.message,
            sheet: { headers: err.headers, recognized: {}, ignored: err.headers },
          },
          { status: 422 }
        );
      }
      return NextResponse.json({ error: reason }, { status: 502 });
    }
  } else {
    return NextResponse.json({ error: "This connector type has no sync implementation yet." }, { status: 501 });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "The sheet has a header row but no unit rows underneath it." },
      { status: 400 }
    );
  }

  try {
    const result = await runInventorySync(connectorId, rows, actor, { dryRun });
    return NextResponse.json({ ...result, sheet: sheetMeta });
  } catch (err) {
    await logApiError(`/api/admin/inventory-connectors/${connectorId}/sync`, err, actor);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed." }, { status: 500 });
  }
}
