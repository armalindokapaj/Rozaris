import { prisma } from "@/lib/db";
import { normalizePublisher } from "@/lib/listings";
import type { Publisher } from "@/lib/types";

/**
 * Server-only real Postgres `Publisher` directory, for `/developers` and
 * `/developer/[slug]` (both server components). Replaces `mockData.
 * publishers`/`getPublisherBySlug`, which meant a real signed-up,
 * admin-verified publisher could never appear in the public directory —
 * only the 7 hardcoded seed rows ever could (launch-readiness audit
 * finding). Only import this from server contexts — it pulls in
 * `@/lib/db` (Prisma), which must never reach the browser bundle.
 */
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
