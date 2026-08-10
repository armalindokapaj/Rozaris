import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

/**
 * Issues short-lived, scoped upload tokens for Admin's "3D Map Control" GLB
 * uploads (MapModelEditor.tsx) — the browser uploads the file bytes directly
 * to Vercel Blob using that token (@vercel/blob/client's `upload()`), never
 * routing multi-MB GLBs through this (or any) serverless function body,
 * which on Vercel is capped well under typical GLB sizes.
 *
 * ⚠️ Known gap, deliberately left open for this phase (see the
 * "rozaris-backend-plan" memory): this route does not yet check who's
 * calling it. Real auth (src/auth.ts) exists but isn't wired into the UI's
 * sign-in flow yet, so there is no session to check here. Uncomment the
 * admin check below the moment that lands — until then, anyone with the
 * deployed URL can upload a GLB (not delete/overwrite others' — pathnames
 * are randomized — but still an open write). Acceptable for a demo/testing
 * deployment, not for a real launch.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // const session = await auth();
        // if (session?.user?.role !== "admin") throw new Error("Not authorized");
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
