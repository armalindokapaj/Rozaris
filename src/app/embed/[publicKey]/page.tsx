import { Suspense } from "react";
import { WhiteLabelViewer } from "@/components/viewer-runtime/WhiteLabelViewer";

/**
 * Multi-Channel Publishing PRD Phase 5 — the white-label embed route,
 * `/embed/[publicKey]`. Lives outside the `(site)` route group
 * deliberately, same reason `/project/[slug]` does (see the
 * "Menu/Top Bar scope rule" memory) — this page is meant to be iframed
 * into a THIRD PARTY's own page; Rozaris's own Header/Menu/Footer chrome
 * wrapped around it would be wrong twice over (double chrome inside
 * someone else's page, and it would assume marketplace context that
 * doesn't apply here).
 *
 * All real data loading happens client-side in `WhiteLabelViewer` (via
 * `useEmbedBootstrap`, hitting the already-verified public
 * `/api/viewer/v1/t/[publicKey]/*` surface) — this file's only job is to
 * exist as a route and stay out of the way. No `generateStaticParams`:
 * `publicKey`s are created/rotated by admins at runtime, not known at
 * build time, and this route's content is inherently per-request
 * (license window, suspension, revision-tracked inventory) so static
 * generation would be actively wrong here, unlike `/project/[slug]`.
 *
 * CSP `frame-ancestors` for this path is carved out in `next.config.ts`
 * (see its own comment) — the platform-wide `frame-ancestors 'none'`
 * would otherwise block this page from ever being embedded at all, which
 * defeats the entire point of this route existing.
 */
export default async function EmbedPage({ params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params;
  return (
    <Suspense fallback={null}>
      <WhiteLabelViewer publicKey={publicKey} />
    </Suspense>
  );
}
