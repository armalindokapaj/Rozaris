-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "hdriId" TEXT,
ADD COLUMN     "sunAzimuthDeg" DOUBLE PRECISION NOT NULL DEFAULT 180,
ADD COLUMN     "sunElevationDeg" DOUBLE PRECISION NOT NULL DEFAULT 45,
ADD COLUMN     "sunIntensity" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "sunMode" TEXT NOT NULL DEFAULT 'geographic';

-- CreateTable
CREATE TABLE "platform_hdris" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,

    CONSTRAINT "platform_hdris_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "project_3d_configs" ADD CONSTRAINT "project_3d_configs_hdriId_fkey" FOREIGN KEY ("hdriId") REFERENCES "platform_hdris"("id") ON DELETE SET NULL ON UPDATE CASCADE;
