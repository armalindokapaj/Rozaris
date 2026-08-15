-- Fix LeadStatus enum to match the real Leads pipeline
-- (New -> Contacted -> Qualified -> Viewing -> Negotiating -> Won -> Lost).
-- Safe recreate: 0 rows exist in `leads`/`lead_status_overrides` referencing
-- the old `closed`/`archived` values at the time of this migration.

ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "leads" ALTER COLUMN "status" TYPE text;
ALTER TABLE "lead_status_overrides" ALTER COLUMN "status" TYPE text;

DROP TYPE "LeadStatus";
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'viewing', 'negotiating', 'won', 'lost');

ALTER TABLE "leads" ALTER COLUMN "status" TYPE "LeadStatus" USING "status"::"LeadStatus";
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'new';
ALTER TABLE "lead_status_overrides" ALTER COLUMN "status" TYPE "LeadStatus" USING "status"::"LeadStatus";
