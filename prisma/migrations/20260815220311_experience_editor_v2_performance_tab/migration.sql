-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "adaptiveQualityEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "customDprCap" DOUBLE PRECISION,
ADD COLUMN     "customRenderScale" DOUBLE PRECISION,
ADD COLUMN     "deviceDetectionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "interactionQualityReductionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "runtimeQualityReductionEnabled" BOOLEAN NOT NULL DEFAULT true;
