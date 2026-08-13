import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Issues short-lived, scoped upload tokens for Admin's "3D Map Control" GLB
 * uploads (MapModelEditor.tsx) — the browser uploads the file bytes directly
 * to Vercel Blob using that token (@vercel/blob/client's `upload()`), never
 * routing multi-MB GLBs through this (or any) serverless function body,
 * which on Vercel is capped well under typical GLB sizes.
 *
 * Real admin check as of the versioning pass (previously a known, flagged
 * gap — see the "rozaris-backend-plan" memory): checks the real Auth.js
 * session (src/auth.ts), established when the Admin console's "Sign In as
 * Admin" button also calls next-auth/react's signIn() — see
 * src/app/admin/page.tsx and src/lib/adminAuth.ts.
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
        // Platform HDRI uploads (PlatformHdriManager) share this same token
        // route but are .hdr/.exr images, not GLBs — browsers don't have a
        // built-in MIME type for either extension, so accept the generic
        // fallback alongside the (rarely actually sent) real ones.
        if (pathname.startsWith("platform-hdri/")) {
          return {
            allowedContentTypes: ["image/vnd.radiance", "image/x-exr", "application/octet-stream"],
            maximumSizeInBytes: 60 * 1024 * 1024,
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ pathname }),
          };
        }
        return {
          allowedContentTypes: ["model/gltf-binary", "application/octet-stream"],
          maximumSizeInBytes: 60 * 1024 * 1024, // keep in sync with MapModelEditor's client-side check
          addRandomSuffix: true,
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
