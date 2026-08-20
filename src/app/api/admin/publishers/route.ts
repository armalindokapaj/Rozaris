import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { slugify } from "@/lib/utils";

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

const createSchema = z.object({
  // Owner account — every Publisher requires exactly one owning User
  // (`ownerUserId` is a required, unique FK), so admin-creating a
  // Publisher for a brand-new B2B/B2C partner means creating that owner
  // account in the same step. Same shape `POST /api/auth/signup` uses for
  // self-service publisher signup, minus the `role` (always "publisher"
  // here) — this is the admin-initiated counterpart to that route, for
  // partners onboarded directly by Rozaris ops rather than signing
  // themselves up.
  ownerName: z.string().min(1),
  ownerEmail: z.string().email(),
  // Admin types this in directly and relays it to the partner out of
  // band (no email-sending infra exists in this app to send a "set your
  // password" link) — same min(8) bar the public signup form enforces.
  ownerPassword: z.string().min(8),

  name: z.string().min(1),
  type: z.enum(["private_owner", "agency", "developer"]),
  phone: z.string().min(1),
  whatsapp: z.string().optional(),
  bio: z.string().optional(),
});

/**
 * Admin-initiated Publisher creation — previously the only code path that
 * ever wrote a `Publisher` row was self-service signup (`POST
 * /api/auth/signup`); admin could only edit/verify a Publisher that
 * already existed (`PATCH /api/admin/publishers/[publisherId]`). This is
 * for onboarding a B2B/B2C partner directly: creates the owner `User` and
 * `Publisher` together in one transaction, same as signup, and — because
 * admin is directly vouching for the partner rather than the partner
 * submitting for review — marks it verified immediately instead of
 * landing in the usual `not_submitted` verification queue.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { ownerName, ownerEmail, ownerPassword, name, type, phone, whatsapp, bio } = parsed.data;
  const email = ownerEmail.toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  try {
    const passwordHash = await bcrypt.hash(ownerPassword, 10);
    const actor = gate.user?.email ?? gate.user?.name ?? "admin";

    let slug = slugify(name);
    let suffix = 2;
    while (await prisma.publisher.findUnique({ where: { slug } })) {
      slug = `${slugify(name)}-${suffix}`;
      suffix++;
    }

    const publisher = await prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        data: { name: ownerName, email, passwordHash, role: "publisher" },
      });
      return tx.publisher.create({
        data: {
          name,
          slug,
          type,
          phone: phone.trim(),
          whatsapp: whatsapp?.trim() || null,
          bio: bio?.trim() || null,
          ownerUserId: owner.id,
          // Auto-verified — admin created this row directly for a known
          // partner, so it skips the usual submit → review queue
          // (VerificationTab) a self-service org would go through.
          verified: true,
          verificationStatus: "verified",
          verificationReviewedAt: new Date(),
          verificationReviewedBy: actor,
        },
      });
    });

    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: "Publisher created by admin (auto-verified)",
      entityType: "Publisher",
      entityId: publisher.id,
      entityLabel: publisher.name,
      newState: { ...publisher, ownerEmail: email },
    });

    return NextResponse.json(publisher, { status: 201 });
  } catch (err) {
    await logApiError("/api/admin/publishers", err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Create failed." }, { status: 500 });
  }
}
