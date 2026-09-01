import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { attachmentHeader, resolveAssetVersion, type AssetKind } from "@/lib/admin3dAssets";

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const limited = rateLimit(`admin-3d-download:${gate.user?.id ?? requestIp(request)}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const versionId = params.get("versionId");
  const variant = params.get("variant") === "source" ? "source" : "public";

  if (kind !== "detail" && kind !== "map") {
    return NextResponse.json({ error: 'kind must be "detail" or "map".' }, { status: 400 });
  }
  if (!versionId) {
    return NextResponse.json({ error: "versionId is required." }, { status: 400 });
  }

  try {
    const resolved = await resolveAssetVersion(kind as AssetKind, versionId, variant);
    if (!resolved.ok) {
      if (resolved.reason === "not_found") {
        return NextResponse.json({ error: "Version not found." }, { status: 404 });
      }
      if (resolved.reason === "no_asset") {
        return NextResponse.json(
          { error: "This version has no model file — it is placement only." },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "This version's asset URL is not on the platform's Blob store and was not fetched." },
        { status: 422 }
      );
    }

    const upstream = await fetch(resolved.asset.url, { signal: request.signal });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Blob store returned ${upstream.status} for this file.` },
        { status: 502 }
      );
    }

    await logAuditEvent({
      actor: gate.user?.email ?? gate.user?.name ?? "admin",
      actorId: gate.user?.id,
      actorRole: gate.user?.role,
      action: variant === "source" ? "3D model downloaded (original upload)" : "3D model downloaded",
      entityType: resolved.asset.entityType,
      entityId: versionId,
      entityLabel: resolved.asset.label,
      metadata: { downloadName: resolved.asset.downloadName, variant },
      ip: requestIp(request),
    });

    const contentLength = upstream.headers.get("content-encoding")
      ? null
      : upstream.headers.get("content-length");

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Disposition": attachmentHeader(resolved.asset.downloadName),
        "Cache-Control": "private, no-store",
        ...(contentLength ? { "Content-Length": contentLength } : {}),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    await logApiError("/api/admin/3d-assets/download", err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Failed to download this model." }, { status: 500 });
  }
}
