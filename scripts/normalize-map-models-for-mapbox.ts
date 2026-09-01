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
