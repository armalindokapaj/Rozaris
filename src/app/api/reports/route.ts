import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  entityType: z.enum(["listing", "project"]),
  entityId: z.string().min(1),
  caseType: z.enum([
    "duplicate",
    "suspicious_price",
    "misleading_media",
    "wrong_location",
    "spam_fraud",
    "copyright",
    "user_report",
  ]),
  note: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const exists =
    parsed.data.entityType === "listing"
      ? await prisma.listing.findUnique({ where: { id: parsed.data.entityId }, select: { id: true } })
      : await prisma.project.findUnique({ where: { id: parsed.data.entityId }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "Listing or project not found." }, { status: 404 });
  }

  const report = await prisma.moderationReport.create({
    data: {
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      caseType: parsed.data.caseType,
      note: parsed.data.note,
      reporterUserId: session.user.id,
    },
  });

  return NextResponse.json({ id: report.id }, { status: 201 });
}
