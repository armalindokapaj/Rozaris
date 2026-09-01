import { NextResponse } from "next/server";
import { getListingDetail } from "@/lib/listings.server";

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
