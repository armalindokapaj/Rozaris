-- AlterTable
ALTER TABLE "detail_model_versions" ADD COLUMN     "slotId" TEXT;

-- CreateTable
CREATE TABLE "detail_model_slots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detail_model_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "detail_model_slots_projectId_idx" ON "detail_model_slots"("projectId");

-- CreateIndex
CREATE INDEX "detail_model_versions_slotId_publicationStatus_idx" ON "detail_model_versions"("slotId", "publicationStatus");

-- AddForeignKey
ALTER TABLE "detail_model_slots" ADD CONSTRAINT "detail_model_slots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detail_model_versions" ADD CONSTRAINT "detail_model_versions_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "detail_model_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
