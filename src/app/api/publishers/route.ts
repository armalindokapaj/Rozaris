import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Real Postgres `Publisher` rows — public, no auth gate (matches every other
 * GET in this app). First real list-consumer: the "Developer" dropdown in
 * the MVP `/admin/projects/new` create-project wizard. `prisma/seed.ts`
 * already seeds all 7 mockData.ts publishers into this table, so this list
 * is real and non-empty on any seeded DB — see `POST /api/projects`, which
 * already validates a submitted `publisherId` against this same table.
 */
export async function GET() {
  const publishers = await prisma.publisher.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
  return NextResponse.json(publishers);
}
