import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Issues short-lived, scoped upload tokens — the browser uploads the file
 * bytes directly to Vercel Blob using that token (@vercel/blob/client's
 * `upload()`), never routing the file through this (or any) serverless
 * function body. Originally just Admin's "3D Map Control" GLB uploads
 * (MapModelEditor.tsx); also issues tokens for real ad-photo uploads
 * (AdvertisingTab.tsx, pathname prefixed `ads/`) — branched by pathname
 * prefix since GLBs and photos need different content types/size caps.
 *
 * Real admin check as of the versioning pass (previously a known, flagged
 * gap — see the "rozaris-backend-plan" memory): checks the real Auth.js
 * session (src/auth.ts), established when the Admin console's "Sign In as
 * Admin" button also calls next-auth/react's signIn() — see
 * src/app/admin/page.tsx and src/lib/adminAuth.ts.
 *
 * Also issues tokens for 360° Backdrop Photo uploads (`panoramas/` prefix,
 * SunSkySubtab.tsx) — PNG-only (the format needs to carry a real alpha
 * channel for the transparent-sky technique to work; JPEG/WebP-lossy have
 * no alpha) and a larger size cap than photo ads, since an equirectangular
 * capture at useful resolution (4K-8K wide) is a much bigger PNG than a
 * small lossy ad banner.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();
        if (session?.user?.role !== "admin") throw new Error("Not authorized");
        const isAdPhoto = pathname.startsWith("ads/");
        const isBackdropPhoto = pathname.startsWith("panoramas/");
        // Project hero/gallery photography, uploaded from the Project
        // Manager's Media section. Same content types as an ad photo but a
        // larger cap — a render or a drone shot of a tower is a much
        // bigger file than a banner, and downscaling it before upload
        // would throw away the resolution the project page wants.
        const isProjectPhoto = pathname.startsWith("projects/");
        return {
          allowedContentTypes:
            isAdPhoto || isProjectPhoto
              ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
              : isBackdropPhoto
                ? ["image/png"]
                : ["model/gltf-binary", "application/octet-stream"],
          // keep in sync with MapModelEditor's/AdvertisingTab's/
          // SunSkySubtab's/ProjectMediaSection's own client-side checks
          maximumSizeInBytes: isAdPhoto
            ? 8 * 1024 * 1024
            : isProjectPhoto
              ? 20 * 1024 * 1024
              : isBackdropPhoto
                ? 45 * 1024 * 1024
                : 60 * 1024 * 1024,
          addRandomSuffix: true,
          // Same reasoning as the detail-model versions route: every
          // upload here (GLBs, ad photos, backdrop panoramas) already
          // gets a random-suffixed, never-overwritten URL, so it's safe
          // to cache far past Blob's 1-month default.
          cacheControlMaxAge: 31536000,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async () => {
        // No DB write yet — the resulting URL is handed back to the client
        // and saved into the (still Zustand-only) ProjectMapModel record.
        // Once Project.mapModel is a real Prisma table, persist it here too
        // so an upload survives even if the client never saves the form.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
