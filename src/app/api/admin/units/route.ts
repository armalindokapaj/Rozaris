import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await prisma.unit.findMany({
    where: { deletedAt: null },
    include: {
      project: { select: { id: true, name: true } },
      listings: {
        where: { deletedAt: null },
        select: { id: true, title: true, status: true },
      },
    },
    orderBy: [{ project: { name: "asc" } }, { buildingName: "asc" }, { code: "asc" }],
  });

  return NextResponse.json(
    rows.map((u) => ({
      id: u.id,
      code: u.code,
      type: u.type,
      buildingName: u.buildingName,
      floor: u.floor,
      status: u.status,
      price: u.price,
      currency: u.currency,
      area: u.area,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      transaction: u.transaction,
      projectId: u.project.id,
      projectName: u.project.name,
      listings: u.listings,
    }))
  );
}
