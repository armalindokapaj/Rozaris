-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'draft';

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "idleReason" TEXT,
ADD COLUMN     "idleUntil" TIMESTAMP(3),
ADD COLUMN     "lastRenewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "locationConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "idleReason" TEXT,
ADD COLUMN     "idleUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "publishers" ADD COLUMN     "restrictedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "statusUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertisements" (
    "id" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertisements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_entityType_entityId_eventType_idx" ON "analytics_events"("entityType", "entityId", "eventType");

-- CreateIndex
CREATE INDEX "analytics_events_entityType_entityId_createdAt_idx" ON "analytics_events"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "advertisements_position_key" ON "advertisements"("position");
