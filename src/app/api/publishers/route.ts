import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const publishers = await prisma.publisher.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
  return NextResponse.json(publishers);
}
