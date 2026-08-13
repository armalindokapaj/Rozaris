import { prisma } from "@/lib/db";

/**
 * Real, forward-only failure log for the System Health panel — Super Admin
 * control/audit pass. Deliberately tiny: no retroactive backfill (errors
 * from before this table existed aren't recoverable, and the panel says so
 * in its empty state), no stack-trace scrubbing/redaction beyond what
 * `String(error)` already gives us. Call from a route's catch block; never
 * let a logging failure mask the original error response.
 */
export async function logApiError(route: string, error: unknown, actor?: string) {
  try {
    await prisma.apiErrorLog.create({
      data: {
        route,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? (error.stack ?? null) : null,
        actor,
      },
    });
  } catch (loggingError) {
    console.error("logApiError: failed to write admin_api_error_log row (continuing)", loggingError);
  }
}
