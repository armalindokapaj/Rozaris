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
