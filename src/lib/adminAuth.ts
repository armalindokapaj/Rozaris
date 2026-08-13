import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Minimal real server-side admin gate for the versioned 3D pipeline's write
 * routes (PRD_Admin_Mapbox_GLB §2 "Access & Permissions",
 * PRD_Admin_3D_Project_Experience §46 "Security" — "Server-side permission
 * checks protect all write operations"). Deliberately narrow: this checks
 * the real Auth.js session (src/auth.ts), which exists server-side but is
 * still not wired into the rest of the app's UI (every other dashboard
 * gate reads the Zustand mock, unchanged by this pass — see the
 * "rozaris-backend-plan" memory for why that fuller rewire is separate).
 *
 * Returns the session on success, or a ready-to-return 401/403
 * NextResponse on failure — call sites do
 * `const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;`
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }
  return session;
}

/**
 * Super Admin control/audit pass — gate for the highest-risk routes this
 * pass adds (hard delete, permission changes, impersonation, force
 * publish/rollback). PRD_ROZARIS_Admin §3 "Future Admin permission scopes":
 * "Super Admin — Admin permission management, highest-risk platform
 * settings and recovery actions." Same `session | NextResponse` return
 * convention as requireAdmin() above — callers do
 * `const gate = await requireSuperAdmin(); if (gate instanceof NextResponse) return gate;`
 *
 * Deliberately layered ON TOP of requireAdmin() (a super admin is always an
 * admin first) rather than duplicating its checks.
 */
export async function requireSuperAdmin() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.superAdmin) {
    return NextResponse.json({ error: "Super Admin permission required." }, { status: 403 });
  }
  return gate;
}

/**
 * Scoped-admin gate (PRD §3's "Listing Reviewer" / "3D Manager" / etc.
 * table) — a super admin always passes every scope check without needing
 * the scope explicitly granted. Only the NEW Super Admin routes this pass
 * adds call this; the ~20 pre-existing admin write routes stay on
 * `requireAdmin()` alone (retrofitting scope checks onto all of them is
 * explicitly out of scope — see the plan's "Explicitly deferred" section).
 */
export async function requireScope(scope: string) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (gate.user?.superAdmin) return gate;
  if (!gate.user?.adminScopes?.includes(scope)) {
    return NextResponse.json({ error: `Missing admin permission scope "${scope}".` }, { status: 403 });
  }
  return gate;
}
