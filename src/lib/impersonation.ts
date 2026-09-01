import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "rz_impersonate";
const MAX_AGE_SECONDS = 60 * 60;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set — impersonation cannot be signed.");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createImpersonationCookieValue(targetUserId: string): { value: string; maxAge: number } {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${targetUserId}.${expiresAt}`;
  const value = `${payload}.${sign(payload)}`;
  return { value, maxAge: MAX_AGE_SECONDS };
}

export function verifyImpersonationCookieValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [targetUserId, expiresAtStr, signature] = parts;
  const payload = `${targetUserId}.${expiresAtStr}`;
  const expected = sign(payload);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return targetUserId;
}

export const IMPERSONATION_COOKIE_NAME = COOKIE_NAME;
