import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePublisherSession, requireOrgRole } from "@/lib/publisherAuth";
import { logAuditEvent } from "@/lib/audit";

export async function GET() {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const publisher = await prisma.publisher.findUnique({
    where: { id: gate.user.publisherId },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      verified: true,
      logoUrl: true,
      phone: true,
      whatsapp: true,
      bio: true,
      legalName: true,
      registrationNumber: true,
      businessAddress: true,
      companyEmail: true,
      website: true,
      restricted: true,
      verificationStatus: true,
      verificationRejectionReason: true,
      developerStatus: true,
    },
  });
  if (!publisher) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(publisher);
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  legalName: z.string().trim().max(200).optional().nullable(),
  registrationNumber: z.string().trim().max(80).optional().nullable(),
  businessAddress: z.string().trim().max(300).optional().nullable(),
  companyEmail: z.string().trim().email().max(160).optional().nullable(),
  website: z.string().trim().max(300).optional().nullable(),
});

export async function PATCH(request: Request) {
  const gate = await requireOrgRole();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const before = await prisma.publisher.findUnique({ where: { id: gate.user.publisherId } });
  if (!before) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const identityChanged =
    (parsed.data.legalName !== undefined && parsed.data.legalName !== before.legalName) ||
    (parsed.data.registrationNumber !== undefined && parsed.data.registrationNumber !== before.registrationNumber);
  const triggersReverify = identityChanged && before.verificationStatus === "verified";

  const updated = await prisma.publisher.update({
    where: { id: gate.user.publisherId },
    data: {
      ...parsed.data,
      ...(triggersReverify
        ? { verificationStatus: "reverify_required" as const, verified: false, verificationRejectionReason: null }
        : {}),
    },
  });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "org",
    actorId: gate.user?.id,
    action: triggersReverify
      ? "Organization profile updated; legal identity change triggered re-verification"
      : "Organization profile updated",
    entityType: "Publisher",
    entityId: gate.user.publisherId,
    previousState: before,
    newState: updated,
  });

  return NextResponse.json({ ok: true });
}
