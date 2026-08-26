-- "Map" tab rewrite (2026-08-26) — real-world SITE CONTEXT as scene geometry.
--
-- The Map tab used to place this project's building on a SEPARATE mapbox-gl
-- view that the visitor switched to, mutually exclusive with the 3D viewer.
-- It now fetches Mapbox raster-DEM + satellite tiles as DATA and rebuilds
-- them as an ordinary THREE.Mesh inside the engine's own scene graph, so the
-- site is lit by the project's own Global Sun Vector and picks up its fog,
-- shadows and post-processing for free.
--
-- Transform rule encoded by these columns: the SITE moves, the building
-- never does. siteOffsetX/Z, siteElevationOffset, siteRotationDeg and
-- siteScale move the world around the project's authored origin — the
-- opposite direction from the mapView* placement columns, which are
-- deliberately RETAINED (not dropped) because projectLocation.ts's
-- syncProjectLocationDependents() writes mapViewLatitude/Longitude on every
-- project move.
--
-- siteRotationDeg additionally feeds the sun: rotating the site is the admin
-- restating where north is, so it is added to the resolved sun azimuth
-- exactly as northOffsetDeg already is.
--
-- Every default is the feature-absent state, so no existing project changes
-- behaviour and no backfill UPDATE is required — Postgres fills existing rows
-- from the DEFAULT on ADD COLUMN.
ALTER TABLE "project_3d_configs" ADD COLUMN     "siteElevationOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "siteEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "siteImageryBrightness" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
ADD COLUMN     "siteImageryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "siteOffsetX" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "siteOffsetZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "siteRadiusM" DOUBLE PRECISION NOT NULL DEFAULT 600,
ADD COLUMN     "siteRotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "siteScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "siteTerrainEnabled" BOOLEAN NOT NULL DEFAULT true;
