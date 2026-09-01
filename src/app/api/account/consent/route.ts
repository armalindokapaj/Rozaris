import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

const bodySchema = z.object({ marketingConsent: z.boolean() });

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      marketingConsent: parsed.data.marketingConsent,
      marketingConsentAt: new Date(),
    },
    select: { marketingConsent: true, marketingConsentAt: true },
  });

  await logAuditEvent({
    actor: session.user.email ?? session.user.name ?? "self",
    actorId: session.user.id,
    action: `Marketing consent → ${parsed.data.marketingConsent ? "granted" : "revoked"}`,
    entityType: "User",
    entityId: session.user.id,
    newState: updated,
  });

  return NextResponse.json(updated);
}
