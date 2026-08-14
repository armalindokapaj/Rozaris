-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "loadingRevealEnabled" BOOLEAN NOT NULL DEFAULT true,
DROP COLUMN     "constructionStagesEnabled";
