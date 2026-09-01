import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

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

export async function requireSuperAdmin() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.superAdmin) {
    return NextResponse.json({ error: "Super Admin permission required." }, { status: 403 });
  }
  return gate;
}

export async function requireScope(scope: string) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (gate.user?.superAdmin) return gate;
  if (!gate.user?.adminScopes?.includes(scope)) {
    return NextResponse.json({ error: `Missing admin permission scope "${scope}".` }, { status: 403 });
  }
  return gate;
}

export async function requireAdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/admin");
  }
}
