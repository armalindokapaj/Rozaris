-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "backdropEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backdropImageUrl" TEXT,
ADD COLUMN     "backdropRotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0;
