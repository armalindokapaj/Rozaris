import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { publishers as mockPublishers } from "@/lib/mockData";

export type AdminSearchResult =
  | { id: string; label: string; sublabel: string; kind: "route"; href: string }
  | { id: string; label: string; sublabel: string; kind: "tab"; tab: string; query: string };

export interface AdminSearchResponse {
  projects: AdminSearchResult[];
  publishers: AdminSearchResult[];
  users: AdminSearchResult[];
}

const LIMIT = 6;

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
