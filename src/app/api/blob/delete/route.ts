import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { url } = (await request.json()) as { url?: string };
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  try {
    await del(url);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
