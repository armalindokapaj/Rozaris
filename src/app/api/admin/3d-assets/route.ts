import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminAssetProjects } from "@/lib/admin3dAssets";
import { logApiError } from "@/lib/apiErrorLog";

/**
 * Admin Dashboard → 3D Health → "Project 3D files": the inventory of
 * every GLB the platform holds, grouped project → slot → version.
 *
 * Genuinely new rather than a duplicate — nothing else in `src/app/api`
 * returns project → [{ slot, versions[] }]. The existing cross-project 3D
 * queries are all counts (`/api/admin/dashboard/3d-health`), a
 * blocked-only list (`/api/admin/system-health`), or single-project
 * routes; the per-project version lists that do exist
 * (`/api/detail-models/[projectId]/slots/[slotId]/versions`) are one
 * request per slot and would need an N+1 fan-out to answer this.
 *
 * Note this response carries NO Blob URLs — see `AdminAssetFile`. Every
 * download goes back through `/api/admin/3d-assets/download` by version
 * id, which keeps the store URLs off the wire and gives the transfer an
 * audit-log entry.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  try {
    const projects = await getAdminAssetProjects();
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
