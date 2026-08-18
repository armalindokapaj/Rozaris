import type { Unit, PublishTargetUnitOverride } from "@/generated/prisma";

export interface PublicUnitDto {
  id: string;
  code: string;
  type: string;
  buildingName: string;
  floor: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  /** `null` when the channel's `PublishTargetUnitOverride.showPrice` is
   * false ("Price on Request", PRD §11's ABC Development example) — never
   * omitted, so a client doesn't need to distinguish "no override" from
   * "price is literally zero." */
  price: number | null;
  currency: string;
  status: string;
  images: string[];
  floorPlanImage: string | null;
  facadeImage: string | null;
  videoUrl: string | null;
}

/**
 * Multi-Channel Publishing PRD Phase 6, §16 "Do not expose the raw Prisma
 * row" — the public inventory endpoint's purpose-built DTO.
 *
 * **Correction (Phase 5, 2026-08-18):** this originally excluded `type`/
 * `buildingName`/`images`/`floorPlanImage`/`facadeImage`/`videoUrl` too,
 * reasoning they were "genuinely unused by the runtime today." That was
 * true only because no real consumer existed yet — now that
 * `ProjectViewerRuntime`'s white-label path actually renders from this
 * DTO, grepping the real components it feeds (`UnitDetailPanel.tsx`,
 * `UnitDiscoveryPanel.tsx`, `units-workspace/UnitDetailView.tsx`) shows
 * every one of those fields genuinely read — a white-label visitor
 * clicking a unit would have gotten a gallery-less, floor-plan-less,
 * building-name-less detail panel. Added back. `transaction` stays
 * excluded — confirmed still unread by any of those same components. All
 * of these are the same public marketing assets/metadata `/project/[slug]`
 * already shows any anonymous visitor today, not a new exposure.
 */
export function toPublicUnitDto(unit: Unit, override: PublishTargetUnitOverride | undefined): PublicUnitDto | null {
  if (override && !override.visible) return null;
  return {
    id: unit.id,
    code: unit.code,
    type: unit.type,
    buildingName: unit.buildingName,
    floor: unit.floor,
    area: unit.area,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    price: override && !override.showPrice ? null : (override?.customPrice ?? unit.price),
    currency: unit.currency,
    status: unit.status,
    images: unit.images,
    floorPlanImage: unit.floorPlanImage,
    facadeImage: unit.facadeImage,
    videoUrl: unit.videoUrl,
  };
}
