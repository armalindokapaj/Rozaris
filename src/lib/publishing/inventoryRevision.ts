import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function bumpInventoryRevision(projectId: string): Promise<void> {
  await prisma.projectInventoryState.upsert({
    where: { projectId },
    create: { projectId, revision: BigInt(1) },
    update: { revision: { increment: 1 } },
  });
  await revalidatePublicProject(projectId);
}

async function revalidatePublicProject(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { slug: true },
    });
    if (!project?.slug) return;
    revalidatePath(`/project/${project.slug}`);
    revalidatePath(`/projects/${project.slug}`);
  } catch {
  }
}
