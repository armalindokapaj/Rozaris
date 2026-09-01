"use client";

import { useEmbedBootstrap } from "@/hooks/useEmbedBootstrap";
import { ProjectViewerRuntime } from "@/components/viewer-runtime/ProjectViewerRuntime";

export function WhiteLabelViewer({ publicKey }: { publicKey: string }) {
  const state = useEmbedBootstrap(publicKey);

  if (state.status === "loading") {
    return (
      <div className="flex h-viewport w-full items-center justify-center bg-neutral-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-viewport w-full flex-col items-center justify-center gap-2 bg-neutral-900 px-6 text-center text-white">
        <p className="text-sm font-medium">This viewer isn&apos;t available right now.</p>
        <p className="text-xs text-neutral-400">{state.error}</p>
      </div>
    );
  }

  return <ProjectViewerRuntime bootstrap={state.bootstrap} channel="white_label" />;
}
