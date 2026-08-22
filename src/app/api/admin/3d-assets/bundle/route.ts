import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { attachmentHeader, collectProjectBundle } from "@/lib/admin3dAssets";
import { createZipStream, zipEntryName, type ZipEntry } from "@/lib/zipStream";

/**
 * Streams every 3D model of one project back as a single `.zip`.
 *
 * `GET /api/admin/3d-assets/bundle?projectId=<id>[&scope=current|all]`
 *
 * `scope=current` (default) is the project's live files — the published
 * version of each detail-model slot plus its map model, falling back to
 * the newest version for a slot that was never published. `scope=all`
 * takes every non-soft-deleted version, i.e. the full history.
 *
 * The archive is built by `src/lib/zipStream.ts`, which is store-only and
 * genuinely streaming: each Blob file is opened only when its turn comes
 * and its bytes are forwarded straight through, so peak memory here is
 * one network chunk rather than the whole archive. That is the whole
 * reason this is not `Promise.all(fetch).then(arrayBuffer)` — a project
 * with a handful of 1–2 MB GLBs would survive that, but a real one with
 * high-poly surroundings would not.
 */

/**
 * Refuse rather than start an archive that is likely to hit a serverless
 * execution limit halfway through and hand the admin a truncated,
 * silently corrupt `.zip`. Measured against the DB's recorded sizes, so
 * it is a pre-flight check, not a guarantee about the real bytes.
 */
const MAX_BUNDLE_BYTES = 1_500_000_000; // 1.5 GB, well inside the non-ZIP64 4 GiB ceiling.

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  // Tighter than the single-file limit: one call here can pull a whole
  // project's history through the function.
  const limited = rateLimit(`admin-3d-bundle:${gate.user?.id ?? requestIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId");
  const scope = params.get("scope") === "all" ? "all" : "current";

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  }

  try {
    const bundle = await collectProjectBundle(projectId, scope);
    if (!bundle) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    if (bundle.entries.length === 0) {
      return NextResponse.json(
        { error: "This project has no downloadable model files." },
        { status: 404 }
      );
    }
    if (bundle.declaredBytes > MAX_BUNDLE_BYTES) {
      return NextResponse.json(
        {
          error:
            "This project's models are too large to bundle in one archive — download them individually.",
        },
        { status: 413 }
      );
    }

    // Names are unique per (slot, version) by construction, but two slots
    // could be named the same thing by an admin, so de-duplicate rather
    // than emit two identically-named entries.
    const used = new Set<string>();
    const zipEntries: ZipEntry[] = bundle.entries.map((entry, index) => {
      let name = zipEntryName(entry.name, `model-${index + 1}.glb`);
      if (used.has(name)) name = zipEntryName(`${index + 1}-${entry.name}`, `model-${index + 1}.glb`);
      used.add(name);
      return {
        name,
        lastModified: entry.lastModified,
        // Tied to the client's connection so an abandoned archive stops
        // pulling from Blob instead of draining to nobody.
        open: async () => {
          const upstream = await fetch(entry.url, { signal: request.signal });
          if (!upstream.ok || !upstream.body) {
            throw new Error(`Blob store returned ${upstream.status}`);
          }
          return upstream.body;
        },
      };
    });

    zipEntries.push(buildManifestEntry(bundle, scope, zipEntries));

    await logAuditEvent({
      actor: gate.user?.email ?? gate.user?.name ?? "admin",
      actorId: gate.user?.id,
      actorRole: gate.user?.role,
      action: `3D models downloaded as archive (${scope})`,
      entityType: "Project",
      entityId: projectId,
      entityLabel: bundle.projectName,
      metadata: {
        scope,
        fileCount: bundle.entries.length,
        declaredBytes: bundle.declaredBytes,
        skipped: bundle.skipped,
      },
      ip: requestIp(request),
    });

    const archiveName = `${bundle.projectSlug}-3d-models${scope === "all" ? "-all-versions" : ""}.zip`;
    return new Response(createZipStream(zipEntries), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": attachmentHeader(archiveName),
        "Cache-Control": "private, no-store",
        // No Content-Length: the archive is produced as it streams and
        // its exact size is not known until the last entry has been read.
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    await logApiError("/api/admin/3d-assets/bundle", err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Failed to build the archive." }, { status: 500 });
  }
}

/**
 * A plain-text MANIFEST inside the archive. Its real job is the "skipped"
 * section: a placement-only map version or a row whose URL failed the
 * Blob host check is legitimately absent, and an archive that is quietly
 * short two files with no explanation is the kind of thing that gets
 * mistaken for data loss.
 */
function buildManifestEntry(
  bundle: Awaited<ReturnType<typeof collectProjectBundle>> & object,
  scope: string,
  entries: ZipEntry[]
): ZipEntry {
  const lines = [
    `Project: ${bundle.projectName} (${bundle.projectSlug})`,
    `Scope:   ${scope === "all" ? "all versions" : "current (published, or newest where never published)"}`,
    `Files:   ${entries.length}`,
    "",
    "Included:",
    ...entries.map((e) => `  - ${e.name}`),
  ];
  if (bundle.skipped.length > 0) {
    lines.push("", "Not included:", ...bundle.skipped.map((s) => `  - ${s.label} — ${s.reason}`));
  }
  lines.push("", "Exported from the Rozaris admin console.", "");
  const bytes = new TextEncoder().encode(lines.join("\n"));
  return {
    name: "MANIFEST.txt",
    lastModified: new Date(0),
    open: async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
  };
}
