import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { slugify } from "@/lib/utils";

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
      createdAt: true,
      verificationStatus: true,
      verificationSubmittedAt: true,
      developerStatus: true,
    },
    take: 100,
  });

  return NextResponse.json(publishers);
}

const createSchema = z.object({
  ownerName: z.string().min(1),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),

  name: z.string().min(1),
  type: z.enum(["private_owner", "agency", "developer"]),
  phone: z.string().min(1),
  whatsapp: z.string().optional(),
  bio: z.string().optional(),
});

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
