import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logApiError } from "@/lib/apiErrorLog";
import { runInventorySync } from "@/lib/integrations/inventorySync";
import { fetchGoogleSheetRows } from "@/lib/integrations/googleSheets";
import type { RawInventoryRow } from "@/lib/integrations/normalization";

const manualSyncSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
});

/**
 * Multi-Channel Publishing PRD Phase 8, §33 "[Sync Now]". Fetch step
 * differs per connector type; the actual write logic is 100% shared
 * (`runInventorySync`). `type: manual` takes `rows` directly in the
 * request body — the one path this session can fully test against the
 * real DB (see googleSheets.ts's own doc comment for why `google_sheets`
 * can't be).
 */
export async function POST(request: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { connectorId } = await params;
  const connector = await prisma.inventoryConnector.findUnique({ where: { id: connectorId } });
  if (!connector) {
    return NextResponse.json({ error: "Connector not found." }, { status: 404 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";

  let rows: RawInventoryRow[];
  if (connector.type === "manual") {
    const parsed = manualSyncSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    rows = parsed.data.rows;
  } else if (connector.type === "google_sheets") {
    if (!connector.externalResourceId) {
      return NextResponse.json({ error: "This connector has no Google Sheet id configured." }, { status: 400 });
    }
    try {
      rows = await fetchGoogleSheetRows(connector.externalResourceId);
    } catch (err) {
      await prisma.inventoryConnector.update({ where: { id: connectorId }, data: { status: "error" } });
      return NextResponse.json({ error: err instanceof Error ? err.message : "Sheet fetch failed." }, { status: 502 });
    }
  } else {
    // type: api — no real external integration target defined yet, see
    // this route's own doc comment and the connector's create-route
    // comment. Honest 501, not a silent no-op.
    return NextResponse.json({ error: "This connector type has no sync implementation yet." }, { status: 501 });
  }

  try {
    const result = await runInventorySync(connectorId, rows, actor);
    return NextResponse.json(result);
  } catch (err) {
    await logApiError(`/api/admin/inventory-connectors/${connectorId}/sync`, err, actor);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed." }, { status: 500 });
  }
}
