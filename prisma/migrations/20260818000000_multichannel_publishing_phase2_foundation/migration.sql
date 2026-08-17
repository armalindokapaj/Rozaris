-- CreateEnum
CREATE TYPE "ViewerReleaseStatus" AS ENUM ('draft', 'ready', 'archived');

-- CreateEnum
CREATE TYPE "PublishTargetType" AS ENUM ('marketplace', 'embed', 'custom_domain', 'kiosk');

-- CreateEnum
CREATE TYPE "PublishTargetStatus" AS ENUM ('draft', 'active', 'suspended', 'expired');

-- AlterTable
-- `updatedAt` gets an explicit DEFAULT CURRENT_TIMESTAMP here (unlike the
-- other new `updatedAt` columns below, all on brand-new empty tables) since
-- `units` already has real rows — this is the standard backfill Prisma's
-- own interactive `migrate dev` would have asked for, applied manually
-- because that flow was bypassed (see the Phase 2 migration-drift note in
-- this file's accompanying commit/memory for why).
ALTER TABLE "units" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "viewer_releases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ViewerReleaseStatus" NOT NULL DEFAULT 'draft',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "manifest" JSONB NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "viewer_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_publish_targets" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "type" "PublishTargetType" NOT NULL,
    "status" "PublishTargetStatus" NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "activeReleaseId" TEXT,
    "customDomain" TEXT,
    "allowedOrigins" TEXT[],
    "branding" JSONB,
    "viewerOverrides" JSONB,
    "licenseStartsAt" TIMESTAMP(3),
    "licenseEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_publish_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_target_unit_overrides" (
    "id" TEXT NOT NULL,
    "publishTargetId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "showPrice" BOOLEAN NOT NULL DEFAULT true,
    "customPrice" DOUBLE PRECISION,
    "ctaType" TEXT,
    "ctaUrl" TEXT,

    CONSTRAINT "publish_target_unit_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_inventory_states" (
    "projectId" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_inventory_states_pkey" PRIMARY KEY ("projectId")
);

-- CreateIndex
CREATE INDEX "viewer_releases_projectId_status_idx" ON "viewer_releases"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "viewer_releases_projectId_version_key" ON "viewer_releases"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "project_publish_targets_publicKey_key" ON "project_publish_targets"("publicKey");

-- CreateIndex
CREATE INDEX "project_publish_targets_projectId_idx" ON "project_publish_targets"("projectId");

-- CreateIndex
CREATE INDEX "project_publish_targets_publisherId_idx" ON "project_publish_targets"("publisherId");

-- CreateIndex
CREATE UNIQUE INDEX "publish_target_unit_overrides_publishTargetId_unitId_key" ON "publish_target_unit_overrides"("publishTargetId", "unitId");

-- AddForeignKey
ALTER TABLE "viewer_releases" ADD CONSTRAINT "viewer_releases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_publish_targets" ADD CONSTRAINT "project_publish_targets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_publish_targets" ADD CONSTRAINT "project_publish_targets_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "publishers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_publish_targets" ADD CONSTRAINT "project_publish_targets_activeReleaseId_fkey" FOREIGN KEY ("activeReleaseId") REFERENCES "viewer_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_target_unit_overrides" ADD CONSTRAINT "publish_target_unit_overrides_publishTargetId_fkey" FOREIGN KEY ("publishTargetId") REFERENCES "project_publish_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_target_unit_overrides" ADD CONSTRAINT "publish_target_unit_overrides_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_inventory_states" ADD CONSTRAINT "project_inventory_states_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

