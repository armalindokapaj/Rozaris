import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminAssetProjects } from "@/lib/admin3dAssets";
import { logApiError } from "@/lib/apiErrorLog";

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  try {
    const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
    const projects = await getAdminAssetProjects(projectId);
    return NextResponse.json({
      projects,
      totalProjects: projects.length,
      totalFiles: projects.reduce((sum, p) => sum + p.fileCount, 0),
      totalBytes: projects.reduce((sum, p) => sum + p.totalBytes, 0),
    });
  } catch (err) {
    await logApiError("/api/admin/3d-assets", err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Failed to load the 3D asset inventory." }, { status: 500 });
  }
}
