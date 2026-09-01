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
  price: number | null;
  currency: string;
  status: string;
  images: string[];
  floorPlanImage: string | null;
  facadeImage: string | null;
  videoUrl: string | null;
}

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
