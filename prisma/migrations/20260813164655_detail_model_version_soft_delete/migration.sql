-- AlterTable
ALTER TABLE "detail_model_versions" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;
