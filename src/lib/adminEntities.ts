import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";

/**
 * Super Admin control/audit pass — the single registry every recycle-bin/
 * hard-delete/entity-lookup route reads from, instead of each route
 * hand-rolling its own per-model switch. Deliberately `any`-typed rows
 * internally (this is an admin-only internal registry, not a public API
 * surface) — Prisma's per-model delegate types don't unify cleanly enough
 * to be worth fighting for a file this size.
 *
 * Covers exactly the 7 models the plan's Recycle Bin scope names: Project,
 * Unit, Listing, User, MapModelVersion, DetailModelVersion, Publisher.
 * `Project3DConfig` is deliberately NOT here — it's a 1:1 singleton with
 * no delete concept, restorable only via AuditLog whole-row snapshots (see
 * /api/admin/entities/.../restore-version). `PlatformHdri` ("media") used
 * to be the 8th — removed 2026-08-14 along with the model itself (see
 * prisma/schema.prisma's own removal note).
 */
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
  /** Prisma model delegate name as it appears on `prisma.*`, and the
   * human-readable entityType string logAuditEvent() calls already use for
   * this model elsewhere in the app — must match exactly so this registry
   * and the pre-existing per-route audit calls resolve the same history. */
  auditEntityType: string;
  findMany: (where: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  findOne: (id: string) => Promise<Record<string, unknown> | null>;
  softDelete: (id: string, actor: string) => Promise<Record<string, unknown>>;
  restore: (id: string) => Promise<Record<string, unknown>>;
  /** The value a Super Admin's hard-delete `confirm` string must exactly
   * match — a human-readable identifier, never the raw cuid. */
  confirmValue: (row: Record<string, unknown>) => string;
  label: (row: Record<string, unknown>) => string;
  /** Deletes the real Postgres row (cascades per schema relations) and,
   * for asset-backed rows, their Blob object(s). Best-effort on Blob —
   * an already-missing blob must not block the row from being removed. */
  hardDelete: (id: string, row: Record<string, unknown>) => Promise<void>;
  /** Real, editable scalar columns a Version History "restore" (whole-row
   * or single named field) is allowed to write back. Deliberately excludes
   * identity columns (id/slug/email — restoring those risks unique-
   * constraint collisions or silently changing what a row *is*), relation
   * FKs (ownership transfer is its own audited action, not a blind
   * restore), and any status column a dedicated invariant-checked route
   * already owns (e.g. MapModelVersion/DetailModelVersion.publicationStatus
   * — publish/rollback enforce "only one published version", a generic
   * restore must not bypass that). */
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

/** Picks only the given keys out of a snapshot object that are actually
 * present in it — used to build a Prisma `update({ data })` payload from a
 * past AuditLog `previousState`/`newState` snapshot without smuggling in
 * relation fields, timestamps, or other non-restorable columns. */
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
// Deliberately excludes email/phone/passwordHash/image — sensitive/
// identity fields a generic field-restore shouldn't silently rewrite.
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
// publicationStatus deliberately excluded on both model-version types —
// publish/rollback enforce the "only one published version" invariant,
// a generic restore must not be able to bypass that.
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
      // onDelete: Cascade also removes the owning User's Publisher link,
      // not the User row itself (schema relation is Publisher -> User, not
      // the reverse) — the account survives, just no longer a publisher.
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

/**
 * `Project3DConfig` restore-only entry — separate from `RECYCLE_BIN_ENTITIES`
 * above because it's a 1:1 singleton keyed by `projectId` (no independent
 * `id` column, no `deletedAt`/delete concept at all: "deleting" a config
 * means nothing when the row always exists alongside its Project 1:1).
 * `/api/admin/entities/[type]/[id]` and `.../restore-version` special-case
 * `entityType === "project3DConfig"` to use this instead of the registry
 * above — its "version history" is entirely AuditLog-snapshot-driven (see
 * the whole-row previousState/newState capture added to
 * `/api/project-3d-config/[projectId]`'s PATCH).
 */
export const PROJECT_3D_CONFIG_ENTITY = {
  auditEntityType: "Project3DConfig",
  findOne: (projectId: string) => prisma.project3DConfig.findUnique({ where: { projectId } }),
  applyState: (projectId: string, state: Record<string, unknown>) =>
    prisma.project3DConfig.update({
      where: { projectId },
      data: pick(state, PROJECT_3D_CONFIG_RESTORABLE_FIELDS),
    }),
};
