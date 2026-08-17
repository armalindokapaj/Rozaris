-- CreateEnum
CREATE TYPE "DetailModelSlotRole" AS ENUM ('building', 'units', 'surroundings', 'context', 'custom');

-- AlterTable
ALTER TABLE "detail_model_slots" ADD COLUMN     "role" "DetailModelSlotRole" NOT NULL DEFAULT 'custom',
ADD COLUMN     "transformParentSlotId" TEXT;

-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "unitBlocksDefaultOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.18,
ADD COLUMN     "unitBlocksEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unitBlocksHoverOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
ADD COLUMN     "unitBlocksSelectedOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.32,
ADD COLUMN     "unitBlocksSelectedOutlineEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unitBlocksStatusColorsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unitBlocksXrayEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unitPoiAutoOcclusionCorrection" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitPoiCameraDistanceMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 3,
ADD COLUMN     "unitPoiCameraEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unitPoiCameraFov" DOUBLE PRECISION NOT NULL DEFAULT 38,
ADD COLUMN     "unitPoiCameraHeightOffset" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "unitPoiTransitionMs" INTEGER NOT NULL DEFAULT 900;

-- AlterTable
ALTER TABLE "unit_mesh_links_v2" ADD COLUMN     "poiDistanceOverride" DOUBLE PRECISION,
ADD COLUMN     "poiEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "poiHeightOverride" DOUBLE PRECISION,
ADD COLUMN     "poiYawDeg" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "detail_model_slots_transformParentSlotId_idx" ON "detail_model_slots"("transformParentSlotId");

-- CreateIndex
CREATE INDEX "unit_mesh_links_v2_unitId_idx" ON "unit_mesh_links_v2"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_mesh_links_v2_detailModelVersionId_unitId_key" ON "unit_mesh_links_v2"("detailModelVersionId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "units_projectId_code_key" ON "units"("projectId", "code");

-- AddForeignKey
ALTER TABLE "detail_model_slots" ADD CONSTRAINT "detail_model_slots_transformParentSlotId_fkey" FOREIGN KEY ("transformParentSlotId") REFERENCES "detail_model_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_mesh_links_v2" ADD CONSTRAINT "unit_mesh_links_v2_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- DataMigration: every DetailModelSlot in this DB today is named exactly
-- "Building" (confirmed via a live query before writing this migration) —
-- promote them from the new column's generic 'custom' default to the real
-- 'building' role, per Units Blocks & POI Layer PRD §2. Any slot created
-- after this migration gets its role set explicitly by the app, not by
-- name-matching (the PRD explicitly says not to detect role from name).
UPDATE "detail_model_slots" SET "role" = 'building' WHERE "name" = 'Building';
