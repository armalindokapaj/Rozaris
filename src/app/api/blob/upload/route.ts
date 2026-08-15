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
        return {
          allowedContentTypes: isAdPhoto
            ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
            : ["model/gltf-binary", "application/octet-stream"],
          maximumSizeInBytes: isAdPhoto ? 8 * 1024 * 1024 : 60 * 1024 * 1024, // keep in sync with MapModelEditor's/AdvertisingTab's client-side checks
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
