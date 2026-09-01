import { prisma } from "@/lib/db";

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
