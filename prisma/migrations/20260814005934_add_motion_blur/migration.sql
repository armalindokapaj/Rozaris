-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "motionBlurAmount" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "motionBlurEnabled" BOOLEAN NOT NULL DEFAULT false;
