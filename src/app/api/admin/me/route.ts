import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Real (not mock-Zustand) check the Super Admin tab uses to decide whether
 * to render its own nav at all — PRD_ROZARIS_Admin's own "Security rule":
 * "Front-end visibility is never authorization." This route being 401/403
 * doesn't grant anything by itself (every route it gates for is separately
 * `requireAdmin()`/`requireSuperAdmin()`-checked server-side); it just lets
 * the UI avoid showing controls that would 403 the moment they're used.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  return NextResponse.json({
    id: gate.user?.id,
    name: gate.user?.name,
    email: gate.user?.email,
    role: gate.user?.role,
    superAdmin: Boolean(gate.user?.superAdmin),
    adminScopes: gate.user?.adminScopes ?? [],
  });
}
