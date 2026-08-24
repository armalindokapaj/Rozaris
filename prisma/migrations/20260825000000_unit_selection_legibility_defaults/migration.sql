-- Selection legibility defaults.
--
-- Shipped defaults made "selected" a +0.14 opacity bump in the unit's OWN
-- status hue plus a 1px outline. That is not a selection indicator at a
-- whole-building camera distance on any device, and it is invisible on a
-- phone. A hue change reads at any size; an alpha change in the same hue
-- does not. `unitBlocksSelectedFillEnabled` already exists as the per-project
-- escape hatch "for projects where the outline alone doesn't read" — that is
-- every project, so it becomes the default.

-- AlterTable: new projects
ALTER TABLE "project_3d_configs" ALTER COLUMN "unitBlocksSelectedFillEnabled" SET DEFAULT true;
ALTER TABLE "project_3d_configs" ALTER COLUMN "unitBlocksSelectedOutlineWidth" SET DEFAULT 2.5;

-- Existing rows carry the OLD defaults as real stored values, so a schema
-- default alone would never reach them.
UPDATE "project_3d_configs" SET "unitBlocksSelectedFillEnabled" = true
WHERE "unitBlocksSelectedFillEnabled" = false;

UPDATE "project_3d_configs" SET "unitBlocksSelectedOutlineWidth" = 2.5
WHERE "unitBlocksSelectedOutlineWidth" < 2.5;

-- A selected block must never be fainter than an unselected one. One real
-- project had reached exactly that state by hand (default 0.45, selected
-- 0.24): someone raised the resting opacity because selection was hard to
-- see, which inverted the signal and made it strictly worse.
UPDATE "project_3d_configs"
SET "unitBlocksSelectedOpacity" = LEAST(0.95, "unitBlocksDefaultOpacity" + 0.2)
WHERE "unitBlocksSelectedOpacity" <= "unitBlocksDefaultOpacity";
