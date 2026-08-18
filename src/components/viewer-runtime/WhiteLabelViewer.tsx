"use client";

import { useEmbedBootstrap } from "@/hooks/useEmbedBootstrap";
import { ProjectViewerRuntime } from "@/components/viewer-runtime/ProjectViewerRuntime";

/**
 * Multi-Channel Publishing PRD Phase 5 — the white-label half of the
 * PRD's own two-wrapper diagram, now real (was a deliberate `throw` stub
 * through Phase 4 — see git history on this file for why, and
 * `useEmbedBootstrap.ts`/`manifestAdapter.ts` for how the
 * `ViewerReleaseManifest` → `ProjectViewerRuntimeBootstrap` gap that stub
 * flagged actually got closed).
 *
 * Rendered by `/embed/[publicKey]/page.tsx`. Deliberately minimal here —
 * loading/error UI is plain and unbranded rather than guessing at a
 * design for `target.branding` (fetched by the hook but not consumed
 * yet — real branding/theming is unbuilt, flagged rather than faked with
 * a default look that might not match what an admin actually configures
 * later).
 */
export function WhiteLabelViewer({ publicKey }: { publicKey: string }) {
  const state = useEmbedBootstrap(publicKey);

  if (state.status === "loading") {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-neutral-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  if (state.status === "error") {
    // 409 ("no release deployed yet") and 403 ("suspended"/license
    // window) are real, expected states an admin can hit while setting a
    // channel up — worth a distinct-enough message from a bare 404, but
    // deliberately not over-designed (see this file's own doc comment on
    // why branding isn't applied here).
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-2 bg-neutral-900 px-6 text-center text-white">
        <p className="text-sm font-medium">This viewer isn&apos;t available right now.</p>
        <p className="text-xs text-neutral-400">{state.error}</p>
      </div>
    );
  }

  return <ProjectViewerRuntime bootstrap={state.bootstrap} channel="white_label" />;
}
