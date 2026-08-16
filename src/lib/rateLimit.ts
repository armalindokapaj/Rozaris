import { NextResponse } from "next/server";

/**
 * Minimal in-memory rate limiter — Platform Audit follow-up (finding H2,
 * see the "rozaris-publish-security-audit" memory): signup, sign-in, and
 * listing submission had zero throttling, which is what turns a weak
 * password (finding C1) into something practically guessable rather than
 * merely bad practice.
 *
 * Honestly scoped like this codebase's other "no real X provider yet" gaps
 * (KYC, SMS OTP, OAuth dedup — see src/lib/verification.ts): this is a
 * single-instance, in-memory fixed-window counter, NOT a distributed
 * limiter. On Vercel's serverless runtime each warm instance keeps its own
 * counts, so a caller spread across many cold starts or regions can exceed
 * the nominal limit. It still raises the bar enormously above "uncapped" —
 * same convention as every other gate in this app (adminAuth.ts,
 * publisherAuth.ts): call sites do
 * `const gate = rateLimit(key, opts); if (gate) return gate;`
 * A real fix needs a shared store (Upstash Redis, Vercel KV) this
 * environment doesn't have configured; swap the Map below for one without
 * changing any call site the moment it does.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Bounds memory under sustained abuse from many distinct keys — sweeps
// expired entries rather than growing forever.
const MAX_BUCKETS = 50_000;

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): NextResponse | null {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > MAX_BUCKETS) sweepExpired(now);
    return null;
  }

  if (existing.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests — try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  existing.count += 1;
  return null;
}

function sweepExpired(now: number) {
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

/** Best-effort caller IP from standard proxy headers (Vercel sets
 * x-forwarded-for) — falls back to a constant so local dev / unknown
 * origins still share *a* bucket rather than throwing or bypassing the
 * limiter entirely. */
export function requestIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
