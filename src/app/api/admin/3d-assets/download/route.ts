import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { attachmentHeader, resolveAssetVersion, type AssetKind } from "@/lib/admin3dAssets";

/**
 * Streams one GLB version back to an admin as a proper file download.
 *
 * `GET /api/admin/3d-assets/download?kind=detail|map&versionId=<id>[&variant=public|source]`
 *
 * Honest accounting of what this proxy does and does not buy, because
 * it matters for how much to trust it: the underlying Vercel Blob URLs
 * are **publicly fetchable** — verified directly, an anonymous
 * `curl -I` against a stored GLB returns 200. So this route is NOT a
 * secrecy boundary for anyone who already holds a store URL. What it
 * genuinely adds is (a) every transfer gets an audit-log row naming the
 * admin who took it, (b) the file arrives named
 * `tower-vlora__Building__v3__Tower-Facade.glb` instead of Blob's own
 * `custom-1787151323713-cmt246e1x…-KySmfIwK1H.glb`, and (c) this panel
 * does not itself hand store URLs to the browser.
 *
 * (c) is worth stating precisely rather than overselling: it is true of
 * this panel, not of the platform. The existing per-project version-list
 * GETs under `/api/detail-models` and `/api/map-models` are
 * *unauthenticated* and return both `sourceAssetUrl` and
 * `publicAssetUrl` in full, so the URLs remain obtainable elsewhere.
 * Gating those is real, separate work — flagged, not silently assumed
 * away by this route existing.
 *
 * Not implemented, deliberately: `Range` forwarding. The response is
 * always a 200 with the whole body, so a dropped transfer restarts from
 * zero rather than resuming. Worth revisiting if the 60 MB upload cap is
 * ever raised; today the bundle route is the answer for bulk.
 *
 * The caller never supplies a URL — only a row id. The URL is read from
 * that row and re-validated against the Blob host allowlist
 * (`isAllowedAssetUrl`) before any fetch, which is what stops this from
 * being an authenticated SSRF gadget. That check is not theoretical: the
 * live database already holds a map version pointing at
 * `https://example.com/nonexistent-test-model.glb`.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  // Keyed by account, not IP — the caller is authenticated, and this is
  // an egress-amplification surface (each hit pulls a multi-megabyte file
  // through the function). No other /api/admin route is throttled today,
  // so there is no in-repo precedent to copy; the limiter's own doc
  // comment is explicit that it is per-instance, not distributed.
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
        // A published map version with no GLB is a documented, valid
        // state ("positioned, no 3D model yet"), so this is a 404 for the
        // *file*, not a server error.
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

    // Tie the upstream transfer to the client's connection: an admin who
    // cancels a large download should release the Blob connection rather
    // than leave this invocation draining bytes nobody wants. No artificial
    // timeout on top — `AbortSignal.timeout` would abort mid-body and hand
    // back a truncated GLB on a slow link, which is worse than a slow one.
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

    // Only pass the length through when the upstream bytes are the bytes
    // we forward. Node's fetch transparently decodes `content-encoding`,
    // so on a compressed response the header would describe the encoded
    // size while the body is the decoded one — the browser then reports a
    // truncated or failed download. Losing the header costs an
    // indeterminate progress bar; getting it wrong costs a corrupt file.
    const contentLength = upstream.headers.get("content-encoding")
      ? null
      : upstream.headers.get("content-length");

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Disposition": attachmentHeader(resolved.asset.downloadName),
        // Admin-only bytes: keep them out of shared caches and off disk.
        "Cache-Control": "private, no-store",
        ...(contentLength ? { "Content-Length": contentLength } : {}),
      },
    });
  } catch (err) {
    // A cancelled download is a normal ending, not a server fault — don't
    // spam the System Health error feed with it.
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    await logApiError("/api/admin/3d-assets/download", err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Failed to download this model." }, { status: 500 });
  }
}
