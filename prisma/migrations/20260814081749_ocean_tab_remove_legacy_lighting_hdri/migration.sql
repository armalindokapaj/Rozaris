-- DropForeignKey
ALTER TABLE "project_3d_configs" DROP CONSTRAINT "project_3d_configs_hdriId_fkey";

-- AlterTable
ALTER TABLE "project_3d_configs" DROP COLUMN "allowUserTimeChange",
DROP COLUMN "backgroundBlurriness",
DROP COLUMN "backgroundPreset",
DROP COLUMN "bloomThreshold",
DROP COLUMN "defaultTimeOfDay",
DROP COLUMN "hdriId",
DROP COLUMN "lensflareEnabled",
DROP COLUMN "lightProbeEnabled",
DROP COLUMN "lightingPreset",
DROP COLUMN "motionBlurAmount",
DROP COLUMN "motionBlurEnabled",
DROP COLUMN "northRotationDeg",
DROP COLUMN "simulationDate",
DROP COLUMN "skyPreset",
DROP COLUMN "sunIntensity",
DROP COLUMN "sunMode",
DROP COLUMN "volumetricCloudEnabled",
DROP COLUMN "volumetricCloudOpacity",
DROP COLUMN "volumetricCloudRange",
DROP COLUMN "volumetricCloudSteps",
DROP COLUMN "volumetricCloudThreshold";

-- DropTable
DROP TABLE "platform_hdris";

