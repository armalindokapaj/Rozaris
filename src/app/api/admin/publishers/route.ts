import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/** Admin-facing Publisher list (fuller shape than the public
 * `/api/publishers` picker — includes verification/restriction/deletion
 * state) — backs the Account Controls panel's publisher picker. `?q=`
 * matches name/slug. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();

  const where: Record<string, unknown> = { deletedAt: null };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const publishers = await prisma.publisher.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      phone: true,
      whatsapp: true,
      bio: true,
      verified: true,
      restricted: true,
      restrictedReason: true,
      restrictedUntil: true,
      // Additive — VerificationTab needs a real signal for "how long has
      // this publisher been waiting", since there's no VerificationRequest
      // entity to carry a real submittedAt. Existing consumers (Account
      // Controls picker, PublishersTab) just ignore the extra field.
      createdAt: true,
      // Account & Profile System PRD v1.0 §9 — real verification state,
      // consumed by VerificationTab's business queue.
      verificationStatus: true,
      verificationSubmittedAt: true,
      developerStatus: true,
    },
    take: 100,
  });

  return NextResponse.json(publishers);
}
