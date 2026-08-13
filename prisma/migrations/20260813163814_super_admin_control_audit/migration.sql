-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'restricted', 'suspended', 'disabled');

-- AlterTable
ALTER TABLE "admin_audit_log" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "actorRole" TEXT,
ADD COLUMN     "hardDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "newState" JSONB,
ADD COLUMN     "previousState" JSONB,
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "map_model_versions" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "platform_hdris" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "publishers" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "restricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restrictedReason" TEXT;

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "adminScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedBy" TEXT,
ADD COLUMN     "statusReason" TEXT,
ADD COLUMN     "superAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "admin_api_error_log" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_api_error_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_api_error_log_route_idx" ON "admin_api_error_log"("route");

-- CreateIndex
CREATE INDEX "admin_audit_log_actorId_idx" ON "admin_audit_log"("actorId");
