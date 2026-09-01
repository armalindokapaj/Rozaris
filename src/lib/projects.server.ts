import { prisma } from "@/lib/db";
import { normalizeProject, relatedProjectsFrom } from "@/lib/projects";
import type { Project } from "@/lib/types";

const PUBLIC_WHERE = { deletedAt: null, approvalStatus: "active" as const };
const PUBLIC_INCLUDE = {
  publisher: true,
  units: { where: { deletedAt: null } },
  constructionStages: true,
} as const;

export async function getAllProjects(): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    where: PUBLIC_WHERE,
    include: PUBLIC_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(normalizeProject);
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const row = await prisma.project.findFirst({
    where: { slug, ...PUBLIC_WHERE },
    include: PUBLIC_INCLUDE,
  });
  return row ? normalizeProject(row) : null;
}

export async function getProjectById(id: string): Promise<Project | null> {
  const row = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: PUBLIC_INCLUDE,
  });
  return row ? normalizeProject(row) : null;
}

export async function getAllProjectSlugs(): Promise<string[]> {
  const rows = await prisma.project.findMany({ where: PUBLIC_WHERE, select: { slug: true } });
  return rows.map((r) => r.slug);
}

export async function getRelatedProjects(project: Project, count = 3): Promise<Project[]> {
  const all = await getAllProjects();
  return relatedProjectsFrom(all, project, count);
}

export async function getProjectsByDeveloper(publisherId: string): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    where: { ...PUBLIC_WHERE, publisherId },
    include: PUBLIC_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(normalizeProject);
}

export async function getProjectsByPublisherAnyStatus(publisherId: string): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    where: { publisherId, deletedAt: null },
    include: PUBLIC_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(normalizeProject);
}
