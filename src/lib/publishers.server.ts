import { prisma } from "@/lib/db";
import { normalizePublisher } from "@/lib/listings";
import type { Publisher } from "@/lib/types";

export async function getAllPublishers(): Promise<Publisher[]> {
  const rows = await prisma.publisher.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return rows.map(normalizePublisher);
}

export async function getPublisherBySlug(slug: string): Promise<Publisher | null> {
  const row = await prisma.publisher.findFirst({ where: { slug, deletedAt: null } });
  return row ? normalizePublisher(row) : null;
}
