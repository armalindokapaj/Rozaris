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
