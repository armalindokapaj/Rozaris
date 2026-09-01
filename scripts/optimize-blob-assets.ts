import { list, put } from "@vercel/blob";
import { PrismaClient } from "../src/generated/prisma";
import { optimizeGlbForDeliveryDetailed } from "../src/lib/glbOptimize";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const TEXTURES = args.includes("--textures");
const MAX_SIZE = Number(args.find((a) => a.startsWith("--max-size="))?.split("=")[1]) || undefined;
const QUALITY = Number(args.find((a) => a.startsWith("--quality="))?.split("=")[1]) || undefined;
const SLUG = args.find((a) => a.startsWith("--slug="))?.split("=")[1];
const INCLUDE_DRAFTS = args.includes("--include-drafts");

const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;
const pct = (before: number, after: number) => `${((1 - after / before) * 100).toFixed(1)}%`;

interface Target {
  table: "detail_model_versions" | "map_model_versions";
  id: string;
  label: string;
  publicAssetUrl: string;
  sourceAssetUrl: string;
  status: string;
}

async function loadTargets(): Promise<Target[]> {
  const statuses = INCLUDE_DRAFTS ? ["published", "draft"] : ["published"];
  const detail = await prisma.$queryRawUnsafe<Record<string, string>[]>(
    `SELECT v.id, v."publicAssetUrl", v."sourceAssetUrl", v."publicationStatus"::text AS status,
            COALESCE(p.slug, '?') AS slug, COALESCE(s.name, '?') AS slot, v.version::text AS version
     FROM detail_model_versions v
     LEFT JOIN detail_model_slots s ON s.id = v."slotId"
     LEFT JOIN projects p ON p.id = v."projectId"
     WHERE v."deletedAt" IS NULL AND v."publicationStatus"::text = ANY($1)
       AND ($2::text IS NULL OR p.slug = $2)`,
    statuses,
    SLUG ?? null
  );
  const map = await prisma.$queryRawUnsafe<Record<string, string>[]>(
    `SELECT v.id, v."publicAssetUrl", v."sourceAssetUrl", v."publicationStatus"::text AS status,
            COALESCE(p.slug, '?') AS slug, v.version::text AS version
     FROM map_model_versions v
     LEFT JOIN projects p ON p.id = v."projectId"
     WHERE v."deletedAt" IS NULL AND v."publicationStatus"::text = ANY($1)
       AND v."publicAssetUrl" IS NOT NULL
       AND ($2::text IS NULL OR p.slug = $2)`,
    statuses,
    SLUG ?? null
  );

  return [
    ...detail.map((r) => ({
      table: "detail_model_versions" as const,
      id: r.id,
      label: `${r.slug}/${r.slot} v${r.version}`,
      publicAssetUrl: r.publicAssetUrl,
      sourceAssetUrl: r.sourceAssetUrl,
      status: r.status,
    })),
    ...map.map((r) => ({
      table: "map_model_versions" as const,
      id: r.id,
      label: `${r.slug}/map v${r.version}`,
      publicAssetUrl: r.publicAssetUrl,
      sourceAssetUrl: r.sourceAssetUrl,
      status: r.status,
    })),
  ];
}

async function main() {
  console.log(
    `Mode: ${APPLY ? "APPLY (writes blobs + DB)" : "DRY RUN (writes nothing)"} | ` +
      `textures: ${TEXTURES ? `on${MAX_SIZE ? `, max ${MAX_SIZE}px` : ""}${QUALITY ? `, q${QUALITY}` : ""}` : "off (lossless only)"} | ` +
      `statuses: ${INCLUDE_DRAFTS ? "published+draft" : "published"}${SLUG ? ` | slug: ${SLUG}` : ""}\n`
  );

  const probe = await list({ limit: 1 });
  if (probe.blobs.length) {
    const res = await fetch(probe.blobs[0].url, { method: "GET" });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 120);
      console.error(`Cannot read from the Blob store: HTTP ${res.status} — "${body}"`);
      console.error(
        res.status === 403
          ? "The store is blocked (an account/usage state). Unblock it in the Vercel dashboard before running this."
          : "Check BLOB_READ_WRITE_TOKEN and the store's status."
      );
      process.exit(1);
    }
  }

  const targets = await loadTargets();
  console.log(`${targets.length} model version(s) to process.\n`);

  let totalBefore = 0;
  let totalAfter = 0;
  let changed = 0;
  const failures: string[] = [];

  for (const target of targets) {
    try {
      const res = await fetch(target.publicAssetUrl);
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();

      const { bytes, report } = await optimizeGlbForDeliveryDetailed(buffer, {
        textures: TEXTURES,
        textureMaxSize: MAX_SIZE,
        textureQuality: QUALITY,
      });

      totalBefore += report.inputBytes;

      if (report.outputBytes >= report.inputBytes) {
        totalAfter += report.inputBytes;
        console.log(
          `  =  ${target.label.padEnd(30)} ${mb(report.inputBytes)} — no improvement, left alone` +
            (report.texturesSkippedReason && TEXTURES ? ` (textures skipped: ${report.texturesSkippedReason})` : "")
        );
        continue;
      }

      totalAfter += report.outputBytes;
      changed++;
      const note =
        TEXTURES && !report.texturesCompressed ? `  [textures skipped: ${report.texturesSkippedReason}]` : "";
      console.log(
        `  ${APPLY ? "->" : " ?"} ${target.label.padEnd(30)} ${mb(report.inputBytes)} -> ${mb(report.outputBytes)}  ` +
          `(${pct(report.inputBytes, report.outputBytes)} saved, ${report.textureCount} tex / ${report.meshCount} meshes)${note}`
      );

      if (!APPLY) continue;

      const uploaded = await put(`project-detail-models/optimized-${target.id}.glb`, Buffer.from(bytes), {
        access: "public",
        addRandomSuffix: true,
        contentType: "model/gltf-binary",
        cacheControlMaxAge: 31536000,
      });

      await prisma.$executeRawUnsafe(
        `UPDATE "${target.table}" SET "publicAssetUrl" = $1, "updatedAt" = NOW() WHERE id = $2`,
        uploaded.url,
        target.id
      );
    } catch (err) {
      failures.push(`${target.label}: ${(err as Error).message}`);
      console.log(`  !  ${target.label.padEnd(30)} FAILED: ${(err as Error).message}`);
    }
  }

  console.log(
    `\n${changed}/${targets.length} model(s) would shrink. ` +
      `Total: ${mb(totalBefore)} -> ${mb(totalAfter)} (${totalBefore ? pct(totalBefore, totalAfter) : "0%"} saved).`
  );
  if (failures.length) console.log(`\n${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  if (!APPLY && changed) console.log("\nDry run — nothing was written. Re-run with --apply to commit.");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FATAL", err);
  await prisma.$disconnect();
  process.exit(1);
});
