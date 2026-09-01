import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";

export type RecycleBinEntityType =
  | "project"
  | "unit"
  | "publisher"
  | "user"
  | "listing"
  | "mapModelVersion"
  | "detailModelVersion";

export const RECYCLE_BIN_ENTITY_TYPES: RecycleBinEntityType[] = [
  "project",
  "unit",
  "publisher",
  "user",
  "listing",
  "mapModelVersion",
  "detailModelVersion",
];

interface EntityConfig {
  auditEntityType: string;
  findMany: (where: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  findOne: (id: string) => Promise<Record<string, unknown> | null>;
  softDelete: (id: string, actor: string) => Promise<Record<string, unknown>>;
  restore: (id: string) => Promise<Record<string, unknown>>;
  confirmValue: (row: Record<string, unknown>) => string;
  label: (row: Record<string, unknown>) => string;
  hardDelete: (id: string, row: Record<string, unknown>) => Promise<void>;
  restorableFields: string[];
  applyState: (id: string, state: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

async function bestEffortBlobDelete(urls: (string | null | undefined)[]) {
  const unique = Array.from(new Set(urls.filter((u): u is string => Boolean(u))));
  await Promise.all(
    unique.map((url) =>
      del(url).catch((err) => {
        console.error("adminEntities: blob delete failed (continuing)", url, err);
      })
    )
  );
}

function pick(state: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in state) data[field] = state[field];
  }
  return data;
}

const PROJECT_RESTORABLE_FIELDS = [
  "name", "status", "approvalStatus", "progressPercent", "lat", "lng",
  "neighborhoodId", "city", "setting", "propertyType", "heroImage",
  "gallery", "descriptionEn", "descriptionSq", "buildings", "amenities",
  "premium", "completionLabel",
];
const UNIT_RESTORABLE_FIELDS = [
  "code", "type", "buildingName", "floor", "area", "bedrooms", "bathrooms",
  "price", "currency", "transaction", "status", "images", "floorPlanImage",
  "facadeImage", "videoUrl",
];
const PUBLISHER_RESTORABLE_FIELDS = [
  "name", "type", "verified", "logoUrl", "phone", "whatsapp", "bio",
  "restricted", "restrictedReason",
];
const USER_RESTORABLE_FIELDS = [
  "name", "role", "status", "statusReason", "superAdmin", "adminScopes",
  "buyerPreferences",
];
const LISTING_RESTORABLE_FIELDS = [
  "title", "transaction", "rentSubtype", "propertyType", "price",
  "currency", "negotiable", "area", "landArea", "buildingPermit",
  "bedrooms", "bathrooms", "floor", "totalFloors", "yearBuilt",
  "condition", "amenities", "images", "floorPlanImage", "facadeImage",
  "videoUrl", "descriptionEn", "descriptionSq", "premium", "status",
];
const MAP_MODEL_VERSION_RESTORABLE_FIELDS = [
  "scale", "heading", "altitude", "longitude", "latitude",
  "hideBaseBuilding", "hiddenBuildings",
];
const DETAIL_MODEL_VERSION_RESTORABLE_FIELDS = ["scale", "rotationDeg", "altitudeOffset", "nodeOverrides"];

export const RECYCLE_BIN_ENTITIES: Record<RecycleBinEntityType, EntityConfig> = {
  project: {
    auditEntityType: "Project",
    findMany: (where) => prisma.project.findMany({ where, orderBy: { deletedAt: "desc" } }),
    findOne: (id) => prisma.project.findUnique({ where: { id } }),
    softDelete: (id, actor) =>
      prisma.project.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actor } }),
    restore: (id) => prisma.project.update({ where: { id }, data: { deletedAt: null, deletedBy: null } }),
    confirmValue: (row) => String(row.slug),
    label: (row) => String(row.name),
    hardDelete: async (id) => {
      await prisma.project.delete({ where: { id } });
    },
    restorableFields: PROJECT_RESTORABLE_FIELDS,
    applyState: (id, state) =>
      prisma.project.update({ where: { id }, data: pick(state, PROJECT_RESTORABLE_FIELDS) }),
  },
  unit: {
    auditEntityType: "Unit",
    findMany: (where) => prisma.unit.findMany({ where, orderBy: { deletedAt: "desc" } }),
    findOne: (id) => prisma.unit.findUnique({ where: { id } }),
    softDelete: (id, actor) =>
      prisma.unit.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actor } }),
    restore: (id) => prisma.unit.update({ where: { id }, data: { deletedAt: null, deletedBy: null } }),
    confirmValue: (row) => String(row.code),
    label: (row) => String(row.code),
    hardDelete: async (id) => {
      await prisma.unit.delete({ where: { id } });
    },
    restorableFields: UNIT_RESTORABLE_FIELDS,
    applyState: (id, state) =>
      prisma.unit.update({ where: { id }, data: pick(state, UNIT_RESTORABLE_FIELDS) }),
  },
  publisher: {
    auditEntityType: "Publisher",
    findMany: (where) => prisma.publisher.findMany({ where, orderBy: { deletedAt: "desc" } }),
    findOne: (id) => prisma.publisher.findUnique({ where: { id } }),
    softDelete: (id, actor) =>
      prisma.publisher.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actor } }),
    restore: (id) => prisma.publisher.update({ where: { id }, data: { deletedAt: null, deletedBy: null } }),
    confirmValue: (row) => String(row.slug),
    label: (row) => String(row.name),
    hardDelete: async (id) => {
      await prisma.publisher.delete({ where: { id } });
    },
    restorableFields: PUBLISHER_RESTORABLE_FIELDS,
    applyState: (id, state) =>
      prisma.publisher.update({ where: { id }, data: pick(state, PUBLISHER_RESTORABLE_FIELDS) }),
  },
  user: {
    auditEntityType: "User",
    findMany: (where) => prisma.user.findMany({ where, orderBy: { deletedAt: "desc" } }),
    findOne: (id) => prisma.user.findUnique({ where: { id } }),
    softDelete: (id, actor) =>
      prisma.user.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actor } }),
    restore: (id) =>
      prisma.user.update({
        where: { id },
        data: { deletedAt: null, deletedBy: null },
      }),
    confirmValue: (row) => String(row.email ?? row.phone ?? row.id),
    label: (row) => String(row.name),
    hardDelete: async (id) => {
      await prisma.user.delete({ where: { id } });
    },
    restorableFields: USER_RESTORABLE_FIELDS,
    applyState: (id, state) =>
      prisma.user.update({ where: { id }, data: pick(state, USER_RESTORABLE_FIELDS) }),
  },
  listing: {
    auditEntityType: "Listing",
    findMany: (where) => prisma.listing.findMany({ where, orderBy: { deletedAt: "desc" } }),
    findOne: (id) => prisma.listing.findUnique({ where: { id } }),
    softDelete: (id, actor) =>
      prisma.listing.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actor } }),
    restore: (id) => prisma.listing.update({ where: { id }, data: { deletedAt: null, deletedBy: null } }),
    confirmValue: (row) => String(row.slug),
    label: (row) => String(row.title),
    hardDelete: async (id) => {
      await prisma.listing.delete({ where: { id } });
    },
    restorableFields: LISTING_RESTORABLE_FIELDS,
    applyState: (id, state) =>
      prisma.listing.update({ where: { id }, data: pick(state, LISTING_RESTORABLE_FIELDS) }),
  },
  mapModelVersion: {
    auditEntityType: "MapModelVersion",
    findMany: (where) => prisma.mapModelVersion.findMany({ where, orderBy: { deletedAt: "desc" } }),
    findOne: (id) => prisma.mapModelVersion.findUnique({ where: { id } }),
    softDelete: (id, actor) =>
      prisma.mapModelVersion.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actor } }),
    restore: (id) =>
      prisma.mapModelVersion.update({ where: { id }, data: { deletedAt: null, deletedBy: null } }),
    confirmValue: (row) => `v${row.version}`,
    label: (row) => `v${row.version} · ${row.fileName}`,
    hardDelete: async (id, row) => {
      await bestEffortBlobDelete([row.sourceAssetUrl as string, row.publicAssetUrl as string]);
      await prisma.mapModelVersion.delete({ where: { id } });
    },
    restorableFields: MAP_MODEL_VERSION_RESTORABLE_FIELDS,
    applyState: (id, state) =>
      prisma.mapModelVersion.update({ where: { id }, data: pick(state, MAP_MODEL_VERSION_RESTORABLE_FIELDS) }),
  },
  detailModelVersion: {
    auditEntityType: "DetailModelVersion",
    findMany: (where) => prisma.detailModelVersion.findMany({ where, orderBy: { deletedAt: "desc" } }),
    findOne: (id) => prisma.detailModelVersion.findUnique({ where: { id } }),
    softDelete: (id, actor) =>
      prisma.detailModelVersion.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actor } }),
    restore: (id) =>
      prisma.detailModelVersion.update({ where: { id }, data: { deletedAt: null, deletedBy: null } }),
    confirmValue: (row) => `v${row.version}`,
    label: (row) => `v${row.version} · ${row.fileName}`,
    hardDelete: async (id, row) => {
      await bestEffortBlobDelete([row.sourceAssetUrl as string, row.publicAssetUrl as string]);
      await prisma.detailModelVersion.delete({ where: { id } });
    },
    restorableFields: DETAIL_MODEL_VERSION_RESTORABLE_FIELDS,
    applyState: (id, state) =>
      prisma.detailModelVersion.update({
        where: { id },
        data: pick(state, DETAIL_MODEL_VERSION_RESTORABLE_FIELDS),
      }),
  },
};

export function getEntityConfig(entityType: string): EntityConfig | null {
  return (RECYCLE_BIN_ENTITIES as Record<string, EntityConfig>)[entityType] ?? null;
}

const PROJECT_3D_CONFIG_RESTORABLE_FIELDS = [
  "groundEnabled",
  "cameraStartDistanceMultiplier", "cameraMinDistanceMultiplier",
  "cameraMaxDistanceMultiplier", "cameraMaxPolarDeg", "cameraMinPolarDeg",
  "autoRotate", "idleDroneEnabled", "idleDroneDelaySec", "idleDroneOrbitDurationSec",
  "idleDroneClockwise", "idleDroneMotionEnabled", "idleDroneHeightEnabled",
  "idleDroneHeightAmplitude", "idleDroneDistanceEnabled", "idleDroneDistanceAmplitude",
  "idleDroneTargetEnabled", "idleDroneTargetAmplitude", "idleDroneVerticalCycles",
  "idleDronePhaseOffsetDeg", "idleDroneSmoothness",
  "renderingMode",
  "qualityPreset", "glassPreset", "environmentIntensity",
  "cameraFovDesktop", "cameraFovMobile",
  "sunAzimuthDeg", "sunElevationDeg", "fogEnabled",
  "fogColor", "fogDensity", "fogMatchesSky", "unitColorAvailable", "unitColorReserved",
  "unitColorSold", "unitColorSelected", "shadowsEnabled",
  "antialiasEnabled", "cameraPresets", "exposure",
  "viewerUI", "sections",
];

export const PROJECT_3D_CONFIG_ENTITY = {
  auditEntityType: "Project3DConfig",
  findOne: (projectId: string) => prisma.project3DConfig.findUnique({ where: { projectId } }),
  applyState: (projectId: string, state: Record<string, unknown>) =>
    prisma.project3DConfig.update({
      where: { projectId },
      data: pick(state, PROJECT_3D_CONFIG_RESTORABLE_FIELDS),
    }),
};
