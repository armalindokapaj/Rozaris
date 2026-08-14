-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "volumetricCloudEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "volumetricCloudOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
ADD COLUMN     "volumetricCloudRange" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
ADD COLUMN     "volumetricCloudSteps" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "volumetricCloudThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.25;
