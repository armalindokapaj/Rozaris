import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

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
