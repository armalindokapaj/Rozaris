import { PrismaClient } from "@/generated/prisma";

/**
 * Prisma client singleton — the standard Next.js pattern to avoid exhausting
 * Postgres connections from hot-reload spinning up a fresh client on every
 * edit in dev (each `PrismaClient` opens its own connection pool).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
