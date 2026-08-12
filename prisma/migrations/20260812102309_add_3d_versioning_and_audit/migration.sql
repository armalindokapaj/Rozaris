-- CreateEnum
CREATE TYPE "ModelValidationStatus" AS ENUM ('ready', 'warning', 'blocked');

-- CreateEnum
CREATE TYPE "ModelPublicationStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateTable
CREATE TABLE "map_model_versions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceAssetUrl" TEXT NOT NULL,
    "publicAssetUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "triangleCount" INTEGER,
    "meshCount" INTEGER,
    "materialCount" INTEGER,
    "textureCount" INTEGER,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "heading" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "minZoom" INTEGER NOT NULL DEFAULT 13,
    "fullDetailZoom" INTEGER NOT NULL DEFAULT 16,
    "maxZoom" INTEGER,
    "hideBaseBuilding" BOOLEAN NOT NULL DEFAULT false,
    "hiddenBuildingLng" DOUBLE PRECISION,
    "hiddenBuildingLat" DOUBLE PRECISION,
    "validationStatus" "ModelValidationStatus" NOT NULL DEFAULT 'ready',
    "validationIssues" JSONB,
    "publicationStatus" "ModelPublicationStatus" NOT NULL DEFAULT 'draft',
    "uploadedBy" TEXT,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "map_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detail_model_versions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceAssetUrl" TEXT NOT NULL,
    "publicAssetUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "triangleCount" INTEGER,
    "meshCount" INTEGER,
    "materialCount" INTEGER,
    "textureCount" INTEGER,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "altitudeOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validationStatus" "ModelValidationStatus" NOT NULL DEFAULT 'ready',
    "validationIssues" JSONB,
    "publicationStatus" "ModelPublicationStatus" NOT NULL DEFAULT 'draft',
    "uploadedBy" TEXT,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "detail_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_mesh_links_v2" (
    "id" TEXT NOT NULL,
    "detailModelVersionId" TEXT NOT NULL,
    "meshName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "mappingStatus" TEXT NOT NULL DEFAULT 'mapped',
    "mappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_mesh_links_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "map_model_versions_projectId_publicationStatus_idx" ON "map_model_versions"("projectId", "publicationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "map_model_versions_projectId_version_key" ON "map_model_versions"("projectId", "version");

-- CreateIndex
CREATE INDEX "detail_model_versions_projectId_publicationStatus_idx" ON "detail_model_versions"("projectId", "publicationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "detail_model_versions_projectId_version_key" ON "detail_model_versions"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "unit_mesh_links_v2_detailModelVersionId_meshName_key" ON "unit_mesh_links_v2"("detailModelVersionId", "meshName");

-- CreateIndex
CREATE INDEX "admin_audit_log_entityType_entityId_idx" ON "admin_audit_log"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "map_model_versions" ADD CONSTRAINT "map_model_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detail_model_versions" ADD CONSTRAINT "detail_model_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_mesh_links_v2" ADD CONSTRAINT "unit_mesh_links_v2_detailModelVersionId_fkey" FOREIGN KEY ("detailModelVersionId") REFERENCES "detail_model_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
