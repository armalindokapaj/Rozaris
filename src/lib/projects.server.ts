import { prisma } from "@/lib/db";
import { normalizeProject, relatedProjectsFrom } from "@/lib/projects";
import type { Project } from "@/lib/types";

/** Every `include`/`where` combination below is shared so a project only
 * ever reaches the public site through the same gate `POST /api/projects`
 * and the admin publication routes already enforce: not soft-deleted, and
 * `approvalStatus: "active"` (mirrors `Listing.status: "active"` — a
 * project an admin has archived, or one still `pending` a first review,
 * stays out of the public catalog the same way an unapproved listing
 * does). */
const PUBLIC_WHERE = { deletedAt: null, approvalStatus: "active" as const };
const PUBLIC_INCLUDE = {
  publisher: true,
  units: { where: { deletedAt: null } },
  constructionStages: true,
} as const;

/** Server-only project catalog, shared by every server-component consumer
 * (`/projects/[slug]`, `/new-projects`, `/developer/[slug]`) — only import
 * this from server contexts, it pulls in `@/lib/db` (Prisma), which must
 * never reach the browser bundle. Client components use `useLiveProjects`
 * (fetches `GET /api/projects`) instead. */
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

/**
 * Multi-Channel Publishing PRD Phase 5 — the white-label bootstrap
 * route's project lookup. Deliberately narrower gate than
 * `PUBLIC_WHERE` (`deletedAt: null` only, no `approvalStatus: "active"`
 * filter): a `ProjectPublishTarget` is a deliberate, admin-configured
 * distribution channel, not the anonymous marketplace catalog
 * `approvalStatus` moderates — conflating the two would make a white-label
 * client's embed go dark the moment a project's catalog moderation state
 * changes for reasons that have nothing to do with whether that specific
 * channel should still serve. `resolvePublishTarget()` already checks
 * `deletedAt` independently on both the project and its publisher; this
 * repeats only the project half so `getProjectById` is safe to call on
 * its own, not because the caller is expected to skip that check.
 */
export async function getProjectById(id: string): Promise<Project | null> {
  const row = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: PUBLIC_INCLUDE,
  });
  return row ? normalizeProject(row) : null;
}

/** Every slug worth pre-rendering at build time. Live projects created
 * after a deployment simply aren't in this list; `dynamicParams` (Next's
 * default, unchanged here) renders those on demand instead of 404ing. */
export async function getAllProjectSlugs(): Promise<string[]> {
  const rows = await prisma.project.findMany({ where: PUBLIC_WHERE, select: { slug: true } });
  return rows.map((r) => r.slug);
}

/** Same-neighborhood (falling back to same-city) developments for a
 * Project Detail Page's "Related Projects" section — fetches the full
 * live catalog once and reuses `projects.ts`'s pure `relatedProjectsFrom`,
 * same split as `getAllProjects`/`relatedProjectsFrom` keeps the "list of
 * everything" and "pick N related" concerns separate. */
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

/** A publisher's own projects for their dashboard — any `approvalStatus`
 * (unlike `getProjectsByDeveloper`'s public-only `"active"`), since they
 * need to see a still-`pending` or admin-`archived` project of their own
 * too. Mirrors `GET /api/listings?publisherId=`'s same distinction. */
export async function getProjectsByPublisherAnyStatus(publisherId: string): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    where: { publisherId, deletedAt: null },
    include: PUBLIC_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(normalizeProject);
}
