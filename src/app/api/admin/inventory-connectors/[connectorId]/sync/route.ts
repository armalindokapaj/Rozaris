import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logApiError } from "@/lib/apiErrorLog";
import { runInventorySync } from "@/lib/integrations/inventorySync";
import { fetchGoogleSheet, SheetParseError } from "@/lib/integrations/googleSheets";
import type { RawInventoryRow, SyncableField } from "@/lib/integrations/normalization";

const syncBodySchema = z.object({
  /** `type: manual` supplies its rows inline. */
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000).optional(),
  /** Parse + diff only: nothing is written, no sync-run row is created.
   * Also accepted as `?dryRun=1` for a plain link. */
  dryRun: z.boolean().optional(),
});

/**
 * Multi-Channel Publishing PRD Phase 8, §33 "[Sync Now]". Fetch step
 * differs per connector type; the actual write logic is 100% shared
 * (`runInventorySync`). `type: manual` takes `rows` directly in the
 * request body — the one path this session can fully test against the
 * real DB (see googleSheets.ts's own doc comment for why `google_sheets`
 * can't be).
 *
 * `dryRun` is the "Preview changes" half of the Project Manager's sync
 * panel: same fetch, same match, same validation, same diff — no writes.
 * The response additionally carries which sheet columns were recognised
 * (and which were ignored), so a mis-named column shows up as "we didn't
 * read your PRICE column" before it shows up as "nothing changed".
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
      // A failed run is a connector-health fact worth persisting; a failed
      // dry run is the admin actively debugging their sheet and shouldn't
      // flip the stored status on them mid-edit.
      if (!dryRun) {
        await prisma.inventoryConnector.update({
          where: { id: connectorId },
          data: { status: "error", lastSyncAt: new Date() },
        });
      }
      // 422, not 502, when the sheet downloaded fine and simply isn't
      // shaped like inventory — the fix is a header row (or a column
      // mapping), not Google being unreachable. The headers ride along so
      // the panel can offer that mapping right there.
      if (err instanceof SheetParseError) {
        return NextResponse.json(
          {
            error: err.message,
            sheet: { headers: err.headers, recognized: {}, ignored: err.headers },
          },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Sheet fetch failed." },
        { status: 502 }
      );
    }
  } else {
    // type: api — no real external integration target defined yet, see
    // this route's own doc comment and the connector's create-route
    // comment. Honest 501, not a silent no-op.
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
