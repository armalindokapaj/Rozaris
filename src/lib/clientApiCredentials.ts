import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ClientApiScope } from "@/generated/prisma";

export function generateApiKey(): { key: string; keyPrefix: string } {
  const key = `rzk_${randomBytes(24).toString("base64url")}`;
  return { key, keyPrefix: key.slice(0, 12) };
}

export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, 10);
}

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
