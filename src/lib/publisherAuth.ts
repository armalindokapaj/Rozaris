import { NextResponse } from "next/server";
import { auth } from "@/auth";

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

export async function requireOrgRole() {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;
  if (gate.user?.role === "admin") return gate;
  if (gate.user?.orgRole !== "owner" && gate.user?.orgRole !== "admin") {
    return NextResponse.json({ error: "Owner or Org Admin permission required." }, { status: 403 });
  }
  return gate;
}
