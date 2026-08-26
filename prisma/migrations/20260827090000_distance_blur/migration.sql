-- Distance Blur (2026-08-27) — a depth-masked far-field blur for the Project
-- Viewer, so a project reads as "the building, sharp, in a soft surround".
--
-- Why not Depth of Field: the vendored `dof()` node builds a SYMMETRIC
-- circle-of-confusion around a single focus plane (near AND far field), and
-- this app auto-focuses it on the live camera-to-orbit-target distance — so
-- pulling the camera back softens the entire frame, building included. These
-- columns drive a separate stage keyed off absolute distance from the camera
-- instead, in metres, so the building is never in the blurred set.
--
-- Every default is the feature-absent state, so no existing project changes
-- behaviour and no backfill UPDATE is required — Postgres fills existing rows
-- from the DEFAULT on ADD COLUMN.
ALTER TABLE "project_3d_configs" ADD COLUMN     "distanceBlurAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
ADD COLUMN     "distanceBlurEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "distanceBlurFullM" DOUBLE PRECISION NOT NULL DEFAULT 400,
ADD COLUMN     "distanceBlurRadius" DOUBLE PRECISION NOT NULL DEFAULT 2,
ADD COLUMN     "distanceBlurStartM" DOUBLE PRECISION NOT NULL DEFAULT 150;
