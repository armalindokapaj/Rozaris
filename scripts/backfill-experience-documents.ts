/**
 * One-off backfill: populates `experienceDocument` (added by rewrite Track
 * B, Phase 1 — the new versioned "one editor state" snapshot) for every
 * existing `DetailModelVersion` row, which predates the column and so has
 * it `null`. Idempotent — safe to re-run: recomputes and overwrites every
 * row's snapshot from its current fields + its project's current
 * Project3DConfig, same assembly `refreshExperienceDocument` uses at
 * request time, so re-running just re-syncs rather than duplicating.
 *
 * Run with: npx tsx scripts/backfill-experience-documents.ts
 */
import { Prisma, PrismaClient } from "../src/generated/prisma";
import { refreshExperienceDocument } from "../src/lib/experienceDocument";

const prisma = new PrismaClient();

async function main() {
  const versions = await prisma.detailModelVersion.findMany({ select: { id: true, projectId: true } });
  console.log(`Found ${versions.length} detail model versions.`);

  let done = 0;
  for (const v of versions) {
    await refreshExperienceDocument(prisma, v.projectId, v.id);
    done++;
  }

  const withDoc = await prisma.detailModelVersion.count({ where: { NOT: { experienceDocument: { equals: Prisma.JsonNull } } } });
  console.log(`Backfilled ${done} versions. ${withDoc} of ${versions.length} now have a non-null experienceDocument (the rest have no Project3DConfig row for their project yet).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
