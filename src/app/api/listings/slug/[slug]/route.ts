import { NextResponse } from "next/server";
import { getListingDetail } from "@/lib/listings.server";

/**
 * Client-side counterpart to `getListingDetail` (see `listings.server.ts`)
 * — `/listing/[slug]/page.tsx` itself calls that function directly since
 * it's a server component; this route exists for any client-side caller
 * that needs the same lookup (e.g. a "similar listings" widget elsewhere).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const detail = await getListingDetail(slug);
  if (!detail) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }
  return NextResponse.json(detail);
}
