-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "groundColor" TEXT NOT NULL DEFAULT '#d8d6e6',
ADD COLUMN     "groundFogEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groundFogRadius" DOUBLE PRECISION NOT NULL DEFAULT 300,
ADD COLUMN     "groundStyle" TEXT NOT NULL DEFAULT 'disc';

