-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "unitBlocksSelectedFillEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitBlocksSelectedXrayEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitColorSelectedFill" TEXT NOT NULL DEFAULT '#6b55f5';
