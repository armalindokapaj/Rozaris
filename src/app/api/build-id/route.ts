import { NextResponse } from "next/server";

/**
 * The commit the SERVER is currently serving. Paired with
 * `process.env.NEXT_PUBLIC_BUILD_SHA`, which is baked into the client
 * bundle at build time, this answers a question nothing else can:
 * "is this device running the build I just deployed, or a cached older
 * one?"
 *
 * That matters here because the viewer registers a Service Worker
 * (`public/sw-3d-cache.js`) that serves `/_next/static/` cache-first and
 * the page document stale-while-revalidate. A phone that has opened a
 * project before can therefore run older JS against the live config API,
 * and no amount of checking from a desktop can detect it. `ViewerDiagnostics`
 * (`?diag=1`) compares the two and says so in one line.
 *
 * Deliberately `no-store` at every layer: a cached answer to "what is the
 * current build" is worse than no answer. Not matched by the Service
 * Worker's `shouldCacheAsset` either (it only ever touches Blob URLs, the
 * white-label manifest, /textures/ and /luts/).
 */
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
