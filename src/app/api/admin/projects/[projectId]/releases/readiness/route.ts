import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { validateViewerRelease } from "@/lib/publishing/validateRelease";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const readiness = await validateViewerRelease(projectId);
  return NextResponse.json(readiness);
}
