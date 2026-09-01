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
        latitude: 0,
        longitude: 0,
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
