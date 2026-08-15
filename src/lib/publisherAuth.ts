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

/**
 * §8 "Business Teams, Roles & Permissions" — layered on top of
 * `requirePublisherSession()` for the two team-management surfaces
 * (`/api/business/organization` PATCH, `/api/business/team` writes) that
 * only an Owner or Org Admin may touch, not every team member. An admin
 * session still outranks this, same convention as the base gate. Read
 * access to those same routes stays on `requirePublisherSession()` alone —
 * any team member can view the roster/company profile, just not edit it.
 */
export async function requireOrgRole() {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;
  if (gate.user?.role === "admin") return gate;
  if (gate.user?.orgRole !== "owner" && gate.user?.orgRole !== "admin") {
    return NextResponse.json({ error: "Owner or Org Admin permission required." }, { status: 403 });
  }
  return gate;
}
