-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "duplicateOfId" TEXT;

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);
