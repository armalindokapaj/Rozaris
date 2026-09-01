import type { Viewport } from "next";
import { Suspense } from "react";
import { WhiteLabelViewer } from "@/components/viewer-runtime/WhiteLabelViewer";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function EmbedPage({ params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params;
  return (
    <Suspense fallback={null}>
      <WhiteLabelViewer publicKey={publicKey} />
    </Suspense>
  );
}
