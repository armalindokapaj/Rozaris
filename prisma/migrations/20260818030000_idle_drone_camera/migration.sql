-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "idleDroneClockwise" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idleDroneDelaySec" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "idleDroneDistanceAmplitude" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
ADD COLUMN     "idleDroneDistanceEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idleDroneEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idleDroneHeightAmplitude" DOUBLE PRECISION NOT NULL DEFAULT 0.18,
ADD COLUMN     "idleDroneHeightEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idleDroneMotionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idleDroneOrbitDurationSec" DOUBLE PRECISION NOT NULL DEFAULT 80,
ADD COLUMN     "idleDronePhaseOffsetDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "idleDroneSmoothness" DOUBLE PRECISION NOT NULL DEFAULT 0.88,
ADD COLUMN     "idleDroneTargetAmplitude" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
ADD COLUMN     "idleDroneTargetEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idleDroneVerticalCycles" INTEGER NOT NULL DEFAULT 2;

-- Idle Drone Camera PRD §60 — existing rows migrate their prior
-- `autoRotate` value into the new `idleDroneEnabled` master switch (one
-- time only; the column default above already covers every future row).
UPDATE "project_3d_configs" SET "idleDroneEnabled" = "autoRotate";
