import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ClientApiScope } from "@/generated/prisma";

/**
 * Multi-Channel Publishing PRD Phase 10, §50-51 "Client API credentials...
 * Never store plain keys." `rzk_` prefix only for human legibility (same
 * reasoning as `publicKey.ts`'s `pub_` prefix) — 24 random bytes,
 * base64url-encoded, well above brute-forceable.
 */
export function generateApiKey(): { key: string; keyPrefix: string } {
  const key = `rzk_${randomBytes(24).toString("base64url")}`;
  return { key, keyPrefix: key.slice(0, 12) };
}

/** bcrypt, same cost factor and library this app's own password hashing
 * already uses (see src/auth.ts) — not a new dependency, not a new
 * pattern. */
export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, 10);
}

/**
 * Multi-Channel Publishing PRD Phase 10 — the gate a future public
 * `Authorization: Bearer <key>` API route calls, parallel to
 * `requireAdmin()`/`requirePublisherSession()`/`requireProjectPermission()`
 * but for machine callers (a client's CRM/ERP) instead of a browser
 * session. No route calls this yet in this pass — the PRD's own §49
 * "ROZARIS Viewer API" (GET /projects, PATCH /units/[id] with scoped
 * credentials) is real future work this makes possible, not built this
 * session. Verified via bcrypt.compare against every non-revoked
 * credential sharing the key's prefix (never a plaintext lookup) — the
 * same reveal-nothing-until-verified shape a password check uses.
 */
export async function requireApiCredential(request: Request, scope: ClientApiScope) {
  const authHeader = request.headers.get("authorization");
  const key = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  if (!key || !key.startsWith("rzk_")) {
    return NextResponse.json({ error: "Missing or malformed API credential." }, { status: 401 });
  }

  const candidates = await prisma.clientApiCredential.findMany({
    where: { keyPrefix: key.slice(0, 12), revokedAt: null },
  });

  for (const candidate of candidates) {
    if (await bcrypt.compare(key, candidate.keyHash)) {
      if (candidate.expiresAt && candidate.expiresAt < new Date()) {
        return NextResponse.json({ error: "This API credential has expired." }, { status: 401 });
      }
      if (!candidate.scopes.includes(scope)) {
        return NextResponse.json({ error: `This API credential is missing the "${scope}" scope.` }, { status: 403 });
      }
      return { credential: candidate };
    }
  }

  return NextResponse.json({ error: "Invalid API credential." }, { status: 401 });
}
