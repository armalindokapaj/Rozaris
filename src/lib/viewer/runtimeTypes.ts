import type { ProjectDetailModelSlotEntry } from "@/hooks/useProjectDetailModel";
import type { ConstructionTimelineDraft, Project, Project3DConfig, Unit } from "@/lib/types";

/**
 * Multi-Channel Publishing PRD Phase 4 — the shared data contract
 * `ProjectViewerRuntime` renders from. Everything here is exactly what
 * `ArchVizClient` used to fetch itself via 4 hooks tied to live project
 * APIs (`useProjectConstruction`/`useProjectDetailModel`/
 * `useProject3DConfig`/`useProjectUnits`); the runtime component no
 * longer knows or cares *how* this was produced — `MarketplaceViewer`
 * assembles it from those same live hooks today, and `WhiteLabelViewer`
 * will assemble the equivalent shape from a `ViewerRelease` manifest +
 * public inventory endpoint once Phase 5 builds `/embed/[publicKey]`.
 * "One rendering engine... one bugfix fixes everyone" (PRD's own words)
 * only holds if both wrappers feed the exact same shape in.
 *
 * `units` is already resolved to a plain array (never `null`) — matches
 * `ArchVizClient`'s own `liveUnits ?? []` coalescing, done once here
 * instead of separately in every wrapper.
 */
export interface ProjectViewerRuntimeBootstrap {
  project: Project;
  construction: ConstructionTimelineDraft;
  detailModels: ProjectDetailModelSlotEntry[];
  viewerConfig: Project3DConfig;
  units: Unit[];
}

/**
 * Which `ProjectPublishTarget` type is rendering this runtime instance.
 * Not yet used to branch any rendering behavior (Phase 4 is a pure
 * extraction, not a new-behavior phase) — threaded through now so it's
 * available the moment a real per-channel difference is needed (e.g. a
 * white-label CTA/branding treatment), instead of adding a prop later
 * that every existing call site would need to retrofit. Surfaced today
 * only as a `data-viewer-channel` attribute on the runtime's root — real,
 * inspectable in devtools/e2e tests, not a fabricated no-op prop.
 */
export type ViewerChannel = "marketplace" | "white_label";
