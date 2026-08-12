import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Deletes a previously-uploaded blob by URL. `del()` needs the
 * BLOB_READ_WRITE_TOKEN, which stays server-only — this route is the only
 * way the browser (MapModelEditor's "Remove"/"Replace") can trigger it.
 * Real admin check as of the versioning pass — see ../upload/route.ts.
 */
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
