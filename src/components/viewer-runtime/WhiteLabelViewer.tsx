/**
 * Multi-Channel Publishing PRD Phase 4 — the white-label half of the
 * PRD's own two-wrapper diagram. Deliberately NOT implemented yet, and
 * not a fake pass-through either — flagged honestly rather than either
 * skipped silently or built untested:
 *
 * - No route calls this (that's Phase 5: `/embed/[publicKey]`, CSP
 *   `frame-ancestors`, allowed-origin enforcement via
 *   `resolvePublishTarget()`, which already exists and is already
 *   verified — see [[rozaris-multichannel-publishing-prd]]).
 * - The real blocker isn't wiring a fetch call — it's that a
 *   `ViewerReleaseManifest` (per-slot `DetailModelVersion` entries,
 *   merged `unitBindings`/`unitPoi`, a full `Project3DConfig` snapshot —
 *   see `compileRelease.ts`) doesn't map 1:1 onto
 *   `ProjectViewerRuntimeBootstrap`'s shape (which `MarketplaceViewer`
 *   fills from 4 *live* hooks, including one — `useProjectConstruction`
 *   — that has no manifest equivalent at all: construction-progress
 *   isn't part of a compiled release today). Writing that adapter blind,
 *   with no `/embed` route to exercise it through and no real
 *   confirmation it produces a bootstrap `ProjectViewerRuntime` actually
 *   renders correctly, would be untested code pretending to be real —
 *   the same trap `googleSheets.ts`'s doc comment warns about, just for
 *   rendering instead of network I/O.
 *
 * What Phase 5 needs to do here: fetch `bootstrap`+`manifest`+`inventory`
 * from `/api/viewer/v1/t/[publicKey]/*` (all three already exist and are
 * curl-verified), decide how (or whether) to represent construction
 * progress for a white-label channel, then render exactly this:
 *
 *   <ProjectViewerRuntime bootstrap={adapted} channel="white_label" />
 */
export function WhiteLabelViewer({ publicKey }: { publicKey: string }): never {
  throw new Error(
    `WhiteLabelViewer is not implemented yet (publicKey: ${publicKey}) — Phase 5 (\`/embed/[publicKey]\`) wires this up. See this file's own doc comment.`
  );
}
