import { del } from "@vercel/blob";
import { NextResponse } from "next/server";

/**
 * Deletes a previously-uploaded blob by URL. `del()` needs the
 * BLOB_READ_WRITE_TOKEN, which stays server-only — this route is the only
 * way the browser (MapModelEditor's "Remove"/"Replace") can trigger it.
 * Same auth gap noted in ../upload/route.ts applies here.
 */
export async function POST(request: Request): Promise<NextResponse> {
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
