import { createHmac, timingSafeEqual } from "crypto";

/**
 * Real, tamper-evident "View as User" — Super Admin control/audit pass.
 * Deliberately VIEW-ONLY (see the plan's Context section): this signs a
 * short-lived cookie identifying which user a Super Admin is viewing
 * context as; it does not swap the real Auth.js session, so it cannot be
 * used to transact as the target user. Its honest, limited blast radius:
 * only surfaces built specifically to read this cookie (the target's own
 * saved items/searches/notifications/messages in the admin User Activity
 * view) show anything different — most of the app still reads the mock
 * Zustand `auth` slice, unaffected either way (see `rozaris-backend-plan`
 * memory).
 *
 * Signed with `AUTH_SECRET` (the same secret Auth.js itself already uses,
 * present in `.env.local`) via HMAC-SHA256 — a client can't forge a cookie
 * for an arbitrary user without knowing that secret; only
 * `POST /api/admin/impersonate` (Super-Admin-gated) can mint a valid one.
 */
const COOKIE_NAME = "rz_impersonate";
const MAX_AGE_SECONDS = 60 * 60; // 1 hour — deliberately short-lived.

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

/** Verifies the cookie's HMAC and expiry; returns the impersonated
 * user id, or null if missing/tampered/expired. */
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
