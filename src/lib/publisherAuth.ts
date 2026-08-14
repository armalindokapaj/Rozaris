import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Real server-side publisher gate (real auth to UI pass — see the "Rozaris
 * Platform Audit" memory), same `session | NextResponse` convention as
 * `requireAdmin()` in `src/lib/adminAuth.ts`: call sites do
 * `const gate = await requirePublisherSession(); if (gate instanceof NextResponse) return gate;`
 *
 * Checks the real Auth.js session's `publisherId` (resolved once at
 * sign-in — see `src/auth.ts`'s `authorize()`) rather than trusting a
 * client-supplied `publisherId` in the request body, which is what
 * `POST /api/listings` did before this pass (anyone could act as any
 * seeded publisher with a bare `curl`). An admin session also passes,
 * consistent with every admin route implicitly outranking the role it
 * gates — Super Admin/Admin already moderate publisher content elsewhere.
 */
export async function requirePublisherSession() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (session.user.role === "admin") return session;
  if (session.user.role !== "publisher" || !session.user.publisherId) {
    return NextResponse.json({ error: "Publisher account required." }, { status: 403 });
  }
  return session;
}
