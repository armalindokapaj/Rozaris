-- CreateEnum
CREATE TYPE "PublisherVerificationStatus" AS ENUM ('not_submitted', 'pending', 'verified', 'rejected', 'reverify_required');

-- CreateEnum
CREATE TYPE "DeveloperStatus" AS ENUM ('not_applicable', 'pending', 'verified');

-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('not_required', 'pending', 'verified', 'failed', 'expired');

-- AlterTable
ALTER TABLE "publishers" ADD COLUMN     "developerStatus" "DeveloperStatus" NOT NULL DEFAULT 'not_applicable',
ADD COLUMN     "verificationRejectionReason" TEXT,
ADD COLUMN     "verificationReviewedAt" TIMESTAMP(3),
ADD COLUMN     "verificationReviewedBy" TEXT,
ADD COLUMN     "verificationStatus" "PublisherVerificationStatus" NOT NULL DEFAULT 'not_submitted',
ADD COLUMN     "verificationSubmittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "identityNote" TEXT,
ADD COLUMN     "identityRejectionReason" TEXT,
ADD COLUMN     "identityReviewedAt" TIMESTAMP(3),
ADD COLUMN     "identityReviewedBy" TEXT,
ADD COLUMN     "identitySubmittedAt" TIMESTAMP(3),
ADD COLUMN     "identityVerificationStatus" "IdentityVerificationStatus" NOT NULL DEFAULT 'not_required';

-- Data backfill: every row an admin already marked `verified = true` under
-- the old bare-boolean system becomes real `verificationStatus =
-- 'verified'` history (not just a default 'not_submitted' that would
-- otherwise silently re-open them in the new "pending" queue logic).
-- Verified developers also get a matching `developerStatus`, since under
-- the old system that's the only signal that ever existed for it.
UPDATE "publishers"
SET "verificationStatus" = 'verified', "verificationReviewedAt" = "createdAt"
WHERE "verified" = true;

UPDATE "publishers"
SET "developerStatus" = 'verified'
WHERE "verified" = true AND "type" = 'developer';
