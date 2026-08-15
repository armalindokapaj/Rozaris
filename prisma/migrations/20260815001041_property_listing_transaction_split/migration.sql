/*
  Warnings:

  - You are about to drop the column `amenities` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `area` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `bathrooms` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `bedrooms` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `buildingPermit` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `condition` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `floor` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `landArea` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `lat` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `lng` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `locationConfirmed` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `locationId` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `neighborhoodId` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `propertyType` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `totalFloors` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `yearBuilt` on the `listings` table. All the data in the column will be lost.
  - Made the column `propertyId` on table `listings` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "listings" DROP CONSTRAINT "listings_locationId_fkey";

-- DropForeignKey
ALTER TABLE "listings" DROP CONSTRAINT "listings_propertyId_fkey";

-- AlterTable
ALTER TABLE "listings" DROP COLUMN "amenities",
DROP COLUMN "area",
DROP COLUMN "bathrooms",
DROP COLUMN "bedrooms",
DROP COLUMN "buildingPermit",
DROP COLUMN "city",
DROP COLUMN "condition",
DROP COLUMN "floor",
DROP COLUMN "landArea",
DROP COLUMN "lat",
DROP COLUMN "lng",
DROP COLUMN "locationConfirmed",
DROP COLUMN "locationId",
DROP COLUMN "neighborhoodId",
DROP COLUMN "propertyType",
DROP COLUMN "totalFloors",
DROP COLUMN "yearBuilt",
ALTER COLUMN "propertyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "amenities" TEXT[],
ADD COLUMN     "buildingPermit" BOOLEAN,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "condition" TEXT,
ADD COLUMN     "locationConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "neighborhoodId" TEXT;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
