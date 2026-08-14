import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { publishers as mockPublishers } from "@/lib/mockData";

/** `kind: "route"` is a real, different page (a project's 3D editor).
 * `kind: "tab"` switches this shell's own local tab state and seeds that
 * tab's search box with `query` — there's no per-record admin detail page
 * for a publisher or user yet, so the honest destination is "that
 * directory, pre-filtered to this name," not a fabricated detail URL. */
export type AdminSearchResult =
  | { id: string; label: string; sublabel: string; kind: "route"; href: string }
  | { id: string; label: string; sublabel: string; kind: "tab"; tab: string; query: string };

export interface AdminSearchResponse {
  projects: AdminSearchResult[];
  publishers: AdminSearchResult[];
  users: AdminSearchResult[];
}

const LIMIT = 6;

/**
 * PRD_ROZARIS_Admin_Dashboard §14.1 "Global Admin Search" — deliberately
 * scoped down from the PRD's full "Projects, Listings, Units, Publishers,
 * Users" list to Projects/Publishers/Users: those are the three that have
 * a real destination to land on today. Listings/Units don't have a
 * per-record admin detail view yet, so a result for one would have
 * nowhere honest to link — omitted rather than faked.
 *
 * ⚠️ Real-data fix (see the "Rozaris Platform Audit" memory's
 * Projects/Units migration): Projects used to also search mockData's
 * static array alongside this same Prisma query — every seeded project
 * showed up twice (once from each source, same id) once `prisma/seed.ts`
 * started seeding every mockData project into this same table. Postgres
 * alone covers all of them now.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ projects: [], publishers: [], users: [] } satisfies AdminSearchResponse);
  }
  const needle = q.toLowerCase();

  const projects: AdminSearchResult[] = [];

  const publishers: AdminSearchResult[] = mockPublishers
    .filter((p) => p.name.toLowerCase().includes(needle))
    .slice(0, LIMIT)
    .map((p) => ({ id: p.id, label: p.name, sublabel: p.type.replace("_", " "), kind: "tab", tab: "publishers", query: p.name }));

  const [realProjects, realPublishers, realUsers] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, city: true },
      take: LIMIT,
    }),
    prisma.publisher.findMany({
      where: { deletedAt: null, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, type: true },
      take: LIMIT,
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }],
      },
      select: { id: true, name: true, email: true },
      take: LIMIT,
    }),
  ]);

  realProjects.forEach((p) =>
    projects.push({ id: p.id, label: p.name, sublabel: p.city, kind: "route", href: `/admin/3d-experience/${p.id}` })
  );
  realPublishers.forEach((p) =>
    publishers.push({ id: p.id, label: p.name, sublabel: p.type.replace("_", " "), kind: "tab", tab: "publishers", query: p.name })
  );
  const users: AdminSearchResult[] = realUsers.map((u) => ({
    id: u.id,
    label: u.name ?? u.email ?? u.id,
    sublabel: u.email ?? "",
    kind: "tab",
    tab: "users",
    query: u.name ?? u.email ?? "",
  }));

  return NextResponse.json({
    projects: projects.slice(0, LIMIT),
    publishers: publishers.slice(0, LIMIT),
    users: users.slice(0, LIMIT),
  } satisfies AdminSearchResponse);
}
