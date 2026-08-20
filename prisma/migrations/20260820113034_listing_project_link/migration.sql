
-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "projectId" TEXT;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
