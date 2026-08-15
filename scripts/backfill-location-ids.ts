/**
 * One-off data migration: sets `Property.locationId` / `Project.locationId`
 * for every existing row from its (still-present, unchanged) legacy
 * `neighborhoodId` string, now that scripts/seed-locations.ts has given
 * every mockData.ts neighborhood id a real Location row with the same id.
 * Idempotent — only touches rows where `locationId` is still null.
 *
 * `Listing.locationId` no longer exists — the Property/Listing split (see
 * MEMORY note "rozaris-controlled-taxonomy-spec") moved every physical
 * field, `locationId` included, off `Listing` onto the `Property` it
 * points at. This script backfills `Property` instead of `Listing` now.
 *
 * Run with: npx tsx scripts/backfill-location-ids.ts
 * (run scripts/seed-locations.ts first)
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const properties = await prisma.property.findMany({
    where: { locationId: null, neighborhoodId: { not: null } },
    select: { id: true, neighborhoodId: true },
  });
  const projects = await prisma.project.findMany({
    where: { locationId: null },
    select: { id: true, neighborhoodId: true },
  });

  let propertiesMatched = 0;
  let propertiesUnmatched = 0;
  for (const p of properties) {
    const location = await prisma.location.findUnique({ where: { id: p.neighborhoodId! } });
    if (!location) {
      propertiesUnmatched++;
      console.warn(`Property ${p.id}: no Location for neighborhoodId "${p.neighborhoodId}" — left null.`);
      continue;
    }
    await prisma.property.update({ where: { id: p.id }, data: { locationId: location.id } });
    propertiesMatched++;
  }

  let projectsMatched = 0;
  let projectsUnmatched = 0;
  for (const p of projects) {
    const location = await prisma.location.findUnique({ where: { id: p.neighborhoodId } });
    if (!location) {
      projectsUnmatched++;
      console.warn(`Project ${p.id}: no Location for neighborhoodId "${p.neighborhoodId}" — left null.`);
      continue;
    }
    await prisma.project.update({ where: { id: p.id }, data: { locationId: location.id } });
    projectsMatched++;
  }

  console.log(
    `Properties: ${propertiesMatched} backfilled, ${propertiesUnmatched} unmatched. ` +
      `Projects: ${projectsMatched} backfilled, ${projectsUnmatched} unmatched.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
