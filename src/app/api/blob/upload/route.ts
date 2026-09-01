import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

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
        const isProjectPhoto = pathname.startsWith("projects/");
        return {
          allowedContentTypes:
            isAdPhoto || isProjectPhoto
              ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
              : isBackdropPhoto
                ? ["image/png"]
                : ["model/gltf-binary", "application/octet-stream"],
          maximumSizeInBytes: isAdPhoto
            ? 8 * 1024 * 1024
            : isProjectPhoto
              ? 20 * 1024 * 1024
              : isBackdropPhoto
                ? 45 * 1024 * 1024
                : 60 * 1024 * 1024,
          addRandomSuffix: true,
          cacheControlMaxAge: 31536000,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async () => {
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
