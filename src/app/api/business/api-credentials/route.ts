import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgRole } from "@/lib/publisherAuth";
import { logAuditEvent } from "@/lib/audit";
import { generateApiKey, hashApiKey } from "@/lib/clientApiCredentials";

const createCredentialSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.enum(["inventory_read", "inventory_write", "prices_write", "leads_read"])).min(1),
  expiresAt: z.coerce.date().optional(),
});

export async function GET() {
  const gate = await requireOrgRole();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const credentials = await prisma.clientApiCredential.findMany({
    where: { publisherId: gate.user.publisherId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json(credentials);
}

export async function POST(request: Request) {
  const gate = await requireOrgRole();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const parsed = createCredentialSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { key, keyPrefix } = generateApiKey();
  const keyHash = await hashApiKey(key);

  const credential = await prisma.clientApiCredential.create({
    data: {
      publisherId: gate.user.publisherId,
      name: parsed.data.name,
      keyPrefix,
      keyHash,
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expiresAt,
    },
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "publisher";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "API credential created",
    entityType: "ClientApiCredential",
    entityId: credential.id,
    entityLabel: credential.name,
    metadata: { publisherId: gate.user.publisherId, scopes: parsed.data.scopes },
  });

  return NextResponse.json({
    id: credential.id,
    name: credential.name,
    keyPrefix: credential.keyPrefix,
    scopes: credential.scopes,
    expiresAt: credential.expiresAt,
    createdAt: credential.createdAt,
    key,
  });
}
