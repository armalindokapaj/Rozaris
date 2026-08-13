/**
 * One-off data migration: copies every existing legacy
 * ProjectMapModel/ProjectDetailModel/UnitMeshLink row (single mutable row
 * per project) into the new versioned tables
 * (MapModelVersion/DetailModelVersion/UnitMeshLinkV2) as "version 1",
 * preserving every field. Idempotent — safe to re-run: skips a project if
 * a version 1 row already exists for it.
 *
 * Run with: npx tsx scripts/migrate-3d-versions.ts
 *
 * Legacy tables are left untouched (not deleted) — see the "LEGACY" doc
 * comment above ProjectMapModel in prisma/schema.prisma for why.
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const legacyMapModels = await prisma.projectMapModel.findMany();
  const legacyDetailModels = await prisma.projectDetailModel.findMany({
    include: { unitLinks: true },
  });

  console.log(`Found ${legacyMapModels.length} legacy map models, ${legacyDetailModels.length} legacy detail models.`);

  let mapMigrated = 0;
  let mapSkipped = 0;
  for (const row of legacyMapModels) {
    const existing = await prisma.mapModelVersion.findUnique({
      where: { projectId_version: { projectId: row.projectId, version: 1 } },
    });
    if (existing) {
      mapSkipped++;
      continue;
    }
    await prisma.mapModelVersion.create({
      data: {
        projectId: row.projectId,
        version: 1,
        sourceAssetUrl: row.glbUrl,
        publicAssetUrl: row.glbUrl,
        fileName: row.fileName,
        fileSize: row.fileSize,
        latitude: 0, // legacy row had no lat/lng of its own — placement was
        longitude: 0, // always relative to the project's own coords; the new
        // versioned model stores an explicit anchor, defaulted here to 0,0
        // since nothing reads it until an admin re-saves placement — flagged
        // via validationIssues below rather than silently guessing.
        altitude: 0,
        heading: row.rotationDeg,
        scale: row.scale,
        hideBaseBuilding: row.hideBaseBuilding,
        hiddenBuildingLng: row.hiddenBuildingLng,
        hiddenBuildingLat: row.hiddenBuildingLat,
        validationStatus: "warning",
        validationIssues: {
          migratedFromLegacy: true,
          note: "Carried forward from the pre-versioning ProjectMapModel row without re-running structural validation or resolving a real lat/lng anchor — review before publishing further changes.",
        },
        publicationStatus: row.enabled ? "published" : "draft",
        publishedAt: row.enabled ? row.updatedAt : null,
      },
    });
    mapMigrated++;
  }

  let detailMigrated = 0;
  let detailSkipped = 0;
  let linksMigrated = 0;
  for (const row of legacyDetailModels) {
    // Multiple Detail-Model Slots pass — DetailModelVersion.slotId is a
    // required FK now (unique key is [slotId, version], not
    // [projectId, version] anymore), so this legacy-migration path needs
    // a real slot to attach to too. Find-or-create the project's default
    // "Building" slot, same as scripts/migrate-detail-model-slots.ts does
    // for already-versioned rows.
    let slot = await prisma.detailModelSlot.findFirst({ where: { projectId: row.projectId } });
    if (!slot) slot = await prisma.detailModelSlot.create({ data: { projectId: row.projectId, name: "Building", order: 0 } });

    const existing = await prisma.detailModelVersion.findUnique({
      where: { slotId_version: { slotId: slot.id, version: 1 } },
    });
    if (existing) {
      detailSkipped++;
      continue;
    }
    const version = await prisma.detailModelVersion.create({
      data: {
        projectId: row.projectId,
        slotId: slot.id,
        version: 1,
        sourceAssetUrl: row.glbUrl,
        publicAssetUrl: row.glbUrl,
        fileName: row.fileName,
        fileSize: row.fileSize,
        scale: row.scale,
        rotationDeg: row.rotationDeg,
        altitudeOffset: row.altitudeOffset,
        validationStatus: "warning",
        validationIssues: {
          migratedFromLegacy: true,
          note: "Carried forward from the pre-versioning ProjectDetailModel row without re-running structural validation — review before publishing further changes.",
        },
        publicationStatus: row.enabled ? "published" : "draft",
        publishedAt: row.enabled ? row.updatedAt : null,
      },
    });
    detailMigrated++;
    if (row.unitLinks.length > 0) {
      await prisma.unitMeshLinkV2.createMany({
        data: row.unitLinks.map((l) => ({
          detailModelVersionId: version.id,
          meshName: l.meshName,
          unitId: l.unitId,
          mappingStatus: "mapped",
        })),
      });
      linksMigrated += row.unitLinks.length;
    }
  }

  console.log(
    `Map models: ${mapMigrated} migrated, ${mapSkipped} already present. ` +
      `Detail models: ${detailMigrated} migrated, ${detailSkipped} already present. ` +
      `Unit links: ${linksMigrated} migrated.`
  );

  const afterMap = await prisma.mapModelVersion.count();
  const afterDetail = await prisma.detailModelVersion.count();
  const afterLinks = await prisma.unitMeshLinkV2.count();
  console.log(`After: ${afterMap} map_model_versions, ${afterDetail} detail_model_versions, ${afterLinks} unit_mesh_links_v2 rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
