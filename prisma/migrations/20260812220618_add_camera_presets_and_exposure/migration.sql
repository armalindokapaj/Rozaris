-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "cameraPresets" JSONB,
ADD COLUMN     "exposure" DOUBLE PRECISION NOT NULL DEFAULT 1;
