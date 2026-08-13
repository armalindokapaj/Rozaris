/**
 * One-off data migration (Multiple Detail-Model Slots pass): every project
 * that has `DetailModelVersion` rows gets one real `DetailModelSlot`
 * named "Building" created for it if it doesn't already have one.
 * Idempotent — safe to re-run: a project that already has any slot (not
 * just ones this script created) is skipped entirely.
 *
 * Run with: npx tsx scripts/migrate-detail-model-slots.ts
 *
 * Historical note: this originally ran against a transitional schema
 * state where `DetailModelVersion.slotId` was nullable (added to an
 * already-populated table, backfilled here, then tightened to required
 * in a follow-up migration — see prisma/schema.prisma's own history).
 * Once `slotId` became required, a version row implying "its project has
 * a slot" turned from "this script's job" into a schema-enforced
 * invariant — so this now checks `DetailModelSlot` presence directly
 * rather than `DetailModelVersion.slotId` nullability (which the current
 * schema no longer allows querying for at all), making it a permanent,
 * safe-to-rerun defensive check instead of a one-time-only backfill.
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const projectsWithVersions = await prisma.detailModelVersion.findMany({
    distinct: ["projectId"],
    select: { projectId: true },
  });
  console.log(`Found ${projectsWithVersions.length} project(s) with detail model versions.`);

  let slotsCreated = 0;
  let alreadyHadSlot = 0;

  for (const { projectId } of projectsWithVersions) {
    const existing = await prisma.detailModelSlot.count({ where: { projectId } });
    if (existing > 0) {
      alreadyHadSlot++;
      continue;
    }
    // Shouldn't be reachable in practice anymore (slotId is a required
    // FK, so any version row already implies a real slot exists) — kept
    // as a defensive fallback rather than assuming that invariant holds
    // forever.
    await prisma.detailModelSlot.create({ data: { projectId, name: "Building", order: 0 } });
    slotsCreated++;
  }

  console.log(`${slotsCreated} slot(s) created, ${alreadyHadSlot} project(s) already had one.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
