/**
 * One-off backfill: re-lays out every existing "3D Map Control" GLB into
 * the non-interleaved vertex layout Mapbox's own model loader requires.
 *
 * The map now renders project models through Mapbox's native `model`
 * layer (`ProjectModelSource.ts`) instead of a Three.js custom layer, and
 * mapbox-gl cannot read an interleaved POSITION accessor — it throws
 * `RangeError: offset is out of bounds` and the model simply never
 * appears. New uploads are normalized in the browser before they reach
 * Vercel Blob (MapModelEditor.tsx); this script does the same for every
 * model uploaded BEFORE that change, so nobody has to re-upload.
 *
 * Rewrites `publicAssetUrl` only — `sourceAssetUrl` keeps pointing at the
 * untouched original, which is the split those two columns already exist
 * for on the detail-model pipeline.
 *
 * Idempotent: a version whose file is already tightly packed is skipped
 * without re-uploading anything.
 *
 * Run with: npx tsx scripts/normalize-map-models-for-mapbox.ts
 * Add --dry-run to report what would change without writing.
 */

import { put } from "@vercel/blob";
import { prisma } from "../src/lib/db";
import { normalizeGlbForMapbox, isTightlyPacked } from "../src/lib/glbMapboxNormalize";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const versions = await prisma.mapModelVersion.findMany({
    where: { publicAssetUrl: { not: null }, deletedAt: null },
    orderBy: [{ projectId: "asc" }, { version: "asc" }],
  });
  console.log(`${versions.length} map-model version(s) with a file${dryRun ? " (dry run)" : ""}\n`);

  let normalized = 0;
  let skipped = 0;
  let failed = 0;

  for (const version of versions) {
    const label = `${version.projectId} v${version.version} (${version.publicationStatus})`;
    const url = version.publicAssetUrl!;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());

      if (isTightlyPacked(bytes)) {
        console.log(`  skip  ${label} — already Mapbox-readable`);
        skipped += 1;
        continue;
      }

      const result = await normalizeGlbForMapbox(bytes);
      for (const warning of result.warnings) console.warn(`  warn  ${label} — ${warning}`);

      if (dryRun) {
        console.log(`  would ${label} — ${bytes.byteLength} → ${result.bytes.byteLength} bytes`);
        normalized += 1;
        continue;
      }

      const blob = await put(
        `project-map-models/mapbox-${version.projectId}-v${version.version}.glb`,
        Buffer.from(result.bytes),
        {
          access: "public",
          addRandomSuffix: true,
          contentType: "model/gltf-binary",
          cacheControlMaxAge: 31536000,
        }
      );
      await prisma.mapModelVersion.update({
        where: { id: version.id },
        data: { publicAssetUrl: blob.url, fileSize: result.bytes.byteLength },
      });
      console.log(`  ok    ${label} — ${bytes.byteLength} → ${result.bytes.byteLength} bytes`);
      normalized += 1;
    } catch (error) {
      console.error(`  FAIL  ${label} — ${(error as Error).message}`);
      failed += 1;
    }
  }

  console.log(`\nnormalized ${normalized}, skipped ${skipped}, failed ${failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
