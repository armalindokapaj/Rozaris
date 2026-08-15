-- CreateEnum
CREATE TYPE "ModerationEntityType" AS ENUM ('listing', 'project');

-- CreateEnum
CREATE TYPE "ModerationCaseType" AS ENUM ('duplicate', 'suspicious_price', 'misleading_media', 'wrong_location', 'spam_fraud', 'copyright', 'user_report');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('pending', 'actioned', 'dismissed');

-- CreateTable
CREATE TABLE "moderation_reports" (
    "id" TEXT NOT NULL,
    "entityType" "ModerationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "caseType" "ModerationCaseType" NOT NULL,
    "note" TEXT,
    "status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "reporterUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,

    CONSTRAINT "moderation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_reports_entityType_entityId_idx" ON "moderation_reports"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "moderation_reports_status_idx" ON "moderation_reports"("status");
