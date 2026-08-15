-- CreateTable
CREATE TABLE "search_ranking_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "premiumWeight" INTEGER NOT NULL DEFAULT 30,
    "freshListingWeight" INTEGER NOT NULL DEFAULT 8,
    "verifiedPublisherWeight" INTEGER NOT NULL DEFAULT 10,
    "completeInfoWeight" INTEGER NOT NULL DEFAULT 5,
    "threeDProjectWeight" INTEGER NOT NULL DEFAULT 6,
    "poorDataWeight" INTEGER NOT NULL DEFAULT -10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "search_ranking_config_pkey" PRIMARY KEY ("id")
);
