-- CreateEnum
CREATE TYPE "InventoryConnectorType" AS ENUM ('google_sheets', 'api', 'manual');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('active', 'paused', 'error');

-- AlterTable
ALTER TABLE "units" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "inventory_connectors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "InventoryConnectorType" NOT NULL,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'active',
    "externalResourceId" TEXT,
    "credentialsRef" TEXT,
    "configuration" JSONB,
    "columnMapping" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_sync_runs" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceHash" TEXT,
    "rowsRead" INTEGER NOT NULL,
    "rowsChanged" INTEGER NOT NULL,
    "rowsRejected" INTEGER NOT NULL,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_connectors_projectId_idx" ON "inventory_connectors"("projectId");

-- CreateIndex
CREATE INDEX "inventory_sync_runs_connectorId_startedAt_idx" ON "inventory_sync_runs"("connectorId", "startedAt");

-- AddForeignKey
ALTER TABLE "inventory_connectors" ADD CONSTRAINT "inventory_connectors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sync_runs" ADD CONSTRAINT "inventory_sync_runs_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "inventory_connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

