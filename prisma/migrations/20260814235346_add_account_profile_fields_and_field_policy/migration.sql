-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cityLocationId" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "preferredContactMethod" TEXT,
ADD COLUMN     "preferredCurrency" TEXT,
ADD COLUMN     "preferredLanguage" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- CreateTable
CREATE TABLE "field_policies" (
    "key" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "field_policies_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "page_seo_overrides" (
    "page" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "page_seo_overrides_pkey" PRIMARY KEY ("page")
);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cityLocationId_fkey" FOREIGN KEY ("cityLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
