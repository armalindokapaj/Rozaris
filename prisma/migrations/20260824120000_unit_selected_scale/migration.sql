-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "unitBlocksSelectedScale" DOUBLE PRECISION NOT NULL DEFAULT 1.05,
ADD COLUMN     "unitBlocksSelectedScaleEnabled" BOOLEAN NOT NULL DEFAULT false;
