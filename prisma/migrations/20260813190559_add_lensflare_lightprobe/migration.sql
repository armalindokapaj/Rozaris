-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "lensflareEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lightProbeEnabled" BOOLEAN NOT NULL DEFAULT false;
