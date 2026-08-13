-- AlterTable
ALTER TABLE "project_3d_configs" ADD COLUMN     "antialiasEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cameraMinPolarDeg" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fogColor" TEXT NOT NULL DEFAULT '#c9d6e0',
ADD COLUMN     "fogDensity" DOUBLE PRECISION NOT NULL DEFAULT 0.015,
ADD COLUMN     "fogEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gtaoEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "shadowsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ssrEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unitColorAvailable" TEXT NOT NULL DEFAULT '#22c55e',
ADD COLUMN     "unitColorReserved" TEXT NOT NULL DEFAULT '#eab308',
ADD COLUMN     "unitColorSelected" TEXT NOT NULL DEFAULT '#6b55f5',
ADD COLUMN     "unitColorSold" TEXT NOT NULL DEFAULT '#ef4444';
