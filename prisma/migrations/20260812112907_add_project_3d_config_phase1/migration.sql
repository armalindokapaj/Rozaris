-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "allowUserTimeChange" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cameraFovDesktop" INTEGER NOT NULL DEFAULT 38,
ADD COLUMN     "cameraFovMobile" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "defaultTimeOfDay" DOUBLE PRECISION NOT NULL DEFAULT 14,
ADD COLUMN     "environmentIntensity" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "glassPreset" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "northRotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "qualityPreset" TEXT NOT NULL DEFAULT 'high_desktop',
ADD COLUMN     "renderingMode" TEXT NOT NULL DEFAULT 'auto',
ADD COLUMN     "skyPreset" TEXT NOT NULL DEFAULT 'clear_day';
