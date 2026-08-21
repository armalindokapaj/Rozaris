-- AlterTable
ALTER TABLE "map_model_versions" ALTER COLUMN "sourceAssetUrl" DROP NOT NULL,
ALTER COLUMN "publicAssetUrl" DROP NOT NULL,
ALTER COLUMN "fileName" DROP NOT NULL,
ALTER COLUMN "fileSize" DROP NOT NULL;
