import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { attachmentHeader, collectProjectBundle } from "@/lib/admin3dAssets";
import { createZipStream, zipEntryName, type ZipEntry } from "@/lib/zipStream";

const MAX_BUNDLE_BYTES = 1_500_000_000;

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

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

    const used = new Set<string>();
    const zipEntries: ZipEntry[] = bundle.entries.map((entry, index) => {
      let name = zipEntryName(entry.name, `model-${index + 1}.glb`);
      if (used.has(name)) name = zipEntryName(`${index + 1}-${entry.name}`, `model-${index + 1}.glb`);
      used.add(name);
      return {
        name,
        lastModified: entry.lastModified,
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
