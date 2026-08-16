-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "cameraAutoFocusEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cameraDampingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cameraFarClip" DOUBLE PRECISION NOT NULL DEFAULT 2000,
ADD COLUMN     "cameraHelperEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cameraMaxAzimuthDeg" DOUBLE PRECISION,
ADD COLUMN     "cameraMinAzimuthDeg" DOUBLE PRECISION,
ADD COLUMN     "cameraNearClip" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
ADD COLUMN     "cameraOrbitEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cameraPanEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cameraSensorWidthMm" DOUBLE PRECISION NOT NULL DEFAULT 36,
ADD COLUMN     "cameraZoomEnabled" BOOLEAN NOT NULL DEFAULT true;
