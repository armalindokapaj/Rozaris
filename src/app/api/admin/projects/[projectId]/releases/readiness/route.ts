import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { validateViewerRelease } from "@/lib/publishing/validateRelease";

/**
 * Multi-Channel Publishing PRD Phase 3, §34 "Release panel" readiness
 * checklist. Read-only, side-effect-free — safe for the future Distribution
 * UI to poll while an admin is fixing blocking issues.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const readiness = await validateViewerRelease(projectId);
  return NextResponse.json(readiness);
}
