import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { attachmentHeader } from "@/lib/admin3dAssets";
import { buildInventoryWorkbook, XLSX_CONTENT_TYPE, type InventoryRowValues } from "@/lib/integrations/xlsx";

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

  const stream = buildInventoryWorkbook(rows, project.name);

  return new Response(stream, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": attachmentHeader(`${project.slug}-inventory.xlsx`),
      "Cache-Control": "no-store",
    },
  });
}
