-- AlterEnum
BEGIN;
CREATE TYPE "LocationType_new" AS ENUM ('municipality', 'city', 'village', 'neighborhood');
ALTER TABLE "locations" ALTER COLUMN "type" TYPE "LocationType_new" USING ("type"::text::"LocationType_new");
ALTER TYPE "LocationType" RENAME TO "LocationType_old";
ALTER TYPE "LocationType_new" RENAME TO "LocationType";
DROP TYPE "public"."LocationType_old";
COMMIT;

