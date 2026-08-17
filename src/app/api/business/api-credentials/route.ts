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

/**
 * Multi-Channel Publishing PRD Phase 10, §50 — self-service (Owner/Org
 * Admin only, same `requireOrgRole()` gate Business Teams already uses),
 * not admin-managed like Phase 9's `ProjectMembership` — a developer's own
 * CRM-integration credential is exactly the kind of thing PRD §13
 * "ownership structure" puts squarely on their side ("their... leads"),
 * not something Rozaris admin should be a bottleneck for.
 */
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
      // keyHash deliberately excluded — never leaves the server, not even
      // to the owner who created it.
    },
  });
  return NextResponse.json(credentials);
}

/** The plaintext key is returned exactly once, in this response — never
 * persisted, never retrievable again (PRD §50 "Never store plain keys").
 * A publisher that loses it has to revoke and issue a new one, same as
 * every real API-key product. */
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
    key, // one-time reveal
  });
}
