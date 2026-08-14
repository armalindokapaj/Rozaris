-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "depthOfFieldBokehScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "depthOfFieldEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "depthOfFieldFocalLength" DOUBLE PRECISION NOT NULL DEFAULT 10;
