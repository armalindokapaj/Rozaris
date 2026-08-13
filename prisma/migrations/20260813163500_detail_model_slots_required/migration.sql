-- Tightens DetailModelVersion.slotId to required now that
-- scripts/migrate-detail-model-slots.ts has backfilled every existing row
-- (verified: 0 remaining NULLs before this migration was written).

-- DropIndex
DROP INDEX "detail_model_versions_projectId_version_key";

-- AlterTable
ALTER TABLE "detail_model_versions" ALTER COLUMN "slotId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "detail_model_versions_slotId_version_key" ON "detail_model_versions"("slotId", "version");
