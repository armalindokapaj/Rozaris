-- CreateTable
CREATE TABLE "project_detail_models" (
    "projectId" TEXT NOT NULL,
    "glbUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "altitudeOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_detail_models_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "unit_mesh_links" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "meshName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_mesh_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_mesh_links_projectId_meshName_key" ON "unit_mesh_links"("projectId", "meshName");

-- AddForeignKey
ALTER TABLE "project_detail_models" ADD CONSTRAINT "project_detail_models_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_mesh_links" ADD CONSTRAINT "unit_mesh_links_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project_detail_models"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;
