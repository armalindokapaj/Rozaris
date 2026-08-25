import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { attachmentHeader } from "@/lib/admin3dAssets";
import { buildInventoryWorkbook, XLSX_CONTENT_TYPE, type InventoryRowValues } from "@/lib/integrations/xlsx";

/**
 * The Sheet Sync "starter sheet": this project's current inventory as a
 * real `.xlsx`, laid out in exactly the seven columns the Google Sheets
 * connector reads back.
 *
 * `GET /api/admin/projects/[projectId]/inventory-template`
 *
 * Server-side rather than built in the browser for two reasons: the rows
 * are read fresh from Postgres at download time (the client copy can be up
 * to 30s stale, and a starter sheet that disagrees with the DB is worse
 * than no starter sheet), and the browser gets a plain download with a real
 * filename and content type instead of an object URL.
 *
 * Replaces a client-side CSV that arrived in a single column for anyone
 * whose spreadsheet app splits on the locale list separator rather than on
 * commas — see `src/lib/integrations/xlsx.ts` for why `.xlsx` is the format
 * that has no such failure mode.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, slug: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const units = await prisma.unit.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { code: "asc" },
    select: { code: true, area: true, price: true, bedrooms: true, bathrooms: true, floor: true, status: true },
  });

  const rows: InventoryRowValues[] = units.map((u) => ({
    code: u.code,
    area: u.area,
    price: u.price,
    bedrooms: u.bedrooms,
    bathrooms: u.bathrooms,
    floor: u.floor,
    status: u.status,
  }));

  // A project with no units still gets a workbook — the header row alone is
  // the useful artefact when you are setting a sheet up before the
  // inventory exists, which is exactly when a template is wanted.
  const stream = buildInventoryWorkbook(rows, project.name);

  return new Response(stream, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": attachmentHeader(`${project.slug}-inventory.xlsx`),
      "Cache-Control": "no-store",
    },
  });
}
