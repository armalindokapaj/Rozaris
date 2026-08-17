import type { Unit, PublishTargetUnitOverride } from "@/generated/prisma";

export interface PublicUnitDto {
  id: string;
  code: string;
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
}

/**
 * Multi-Channel Publishing PRD Phase 6, §16 "Do not expose the raw Prisma
 * row" — the public inventory endpoint's purpose-built DTO. Deliberately
 * excludes everything the admin-facing `GET /api/projects/[id]/units`
 * returns that a public viewer has no business seeing (images/videoUrl are
 * arguably fine but genuinely unused by the runtime today, floorPlanImage/
 * facadeImage ditto, `deletedAt`/`deletedBy`/`revision` are pure
 * bookkeeping, `transaction`/`type`/`buildingName` aren't consumed by the
 * status-color/X-ray/POI runtime this DTO feeds) — narrower is the
 * correct default for a public response; add fields back only when a real
 * runtime consumer needs them.
 */
export function toPublicUnitDto(unit: Unit, override: PublishTargetUnitOverride | undefined): PublicUnitDto | null {
  if (override && !override.visible) return null;
  return {
    id: unit.id,
    code: unit.code,
    floor: unit.floor,
    area: unit.area,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    price: override && !override.showPrice ? null : (override?.customPrice ?? unit.price),
    currency: unit.currency,
    status: unit.status,
  };
}
