import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export type ApprovalItemType = "listing" | "project" | "publisher_verification";

export interface ApprovalItem {
  id: string;
  type: ApprovalItemType;
  title: string;
  submittedBy: string;
  createdAt: string;
  href: string;
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const [listings, projects, publishers] = await Promise.all([
    prisma.listing.findMany({
      where: { status: "pending", deletedAt: null },
      include: { publisher: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.findMany({
      where: { approvalStatus: "pending", deletedAt: null },
      include: { publisher: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.publisher.findMany({
      where: { verified: false, restricted: false, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const items: ApprovalItem[] = [
    ...listings.map((l) => ({
      id: l.id,
      type: "listing" as const,
      title: l.title,
      submittedBy: l.publisher.name,
      createdAt: l.createdAt.toISOString(),
      href: `/listing/${l.slug}`,
    })),
    ...projects.map((p) => ({
      id: p.id,
      type: "project" as const,
      title: p.name,
      submittedBy: p.publisher.name,
      createdAt: p.createdAt.toISOString(),
      href: `/project/${p.slug}`,
    })),
    ...publishers.map((p) => ({
      id: p.id,
      type: "publisher_verification" as const,
      title: p.name,
      submittedBy: p.name,
      createdAt: p.createdAt.toISOString(),
      href: `/developer/${p.slug}`,
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return NextResponse.json(items);
}
