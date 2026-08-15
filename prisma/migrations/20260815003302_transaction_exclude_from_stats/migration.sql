-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "excludedFromStats" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "excludedReason" TEXT;

-- CreateTable
CREATE TABLE "price_history_entries" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_history_entries_listingId_recordedAt_idx" ON "price_history_entries"("listingId", "recordedAt");

-- AddForeignKey
ALTER TABLE "price_history_entries" ADD CONSTRAINT "price_history_entries_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
