import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeProject } from "@/lib/projects";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await prisma.project.findMany({
    where: { deletedAt: null },
    include: {
      publisher: true,
      units: { where: { deletedAt: null } },
      constructionStages: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    rows.map((row) => ({ ...normalizeProject(row), approvalStatus: row.approvalStatus, createdAt: row.createdAt }))
  );
}
