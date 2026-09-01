import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      builtFor: process.env.VERCEL_ENV ?? "local",
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}
