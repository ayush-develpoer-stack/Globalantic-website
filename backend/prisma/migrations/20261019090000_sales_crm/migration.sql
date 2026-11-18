-- Sales CRM: lead pipeline fields, activity timeline, assignment rules, anonymous marketing events, SALES role.
-- ADDITIVE ONLY: new enum values, new nullable/defaulted columns, new tables. No data is changed or removed.

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SALES';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContactStatus" ADD VALUE 'PROPOSAL_SENT';
ALTER TYPE "ContactStatus" ADD VALUE 'NEGOTIATION';
ALTER TYPE "ContactStatus" ADD VALUE 'WON';
ALTER TYPE "ContactStatus" ADD VALUE 'LOST';

-- AlterTable
ALTER TABLE "contact_leads" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "contactPreference" TEXT,
ADD COLUMN     "duplicateOfId" TEXT,
ADD COLUMN     "emailNormalized" TEXT,
ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "ipHash" TEXT,
ADD COLUMN     "landingPage" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneNormalized" TEXT,
ADD COLUMN     "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "referrer" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "timeline" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT;

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignment_rules" (
    "id" TEXT NOT NULL,
    "service" TEXT,
    "assigneeId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "page" TEXT,
    "service" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_activities_leadId_createdAt_idx" ON "lead_activities"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_assignment_rules_active_idx" ON "lead_assignment_rules"("active");

-- CreateIndex
CREATE INDEX "marketing_events_type_createdAt_idx" ON "marketing_events"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "contact_leads_reference_key" ON "contact_leads"("reference");

-- CreateIndex
CREATE INDEX "contact_leads_assignedToId_idx" ON "contact_leads"("assignedToId");

-- CreateIndex
CREATE INDEX "contact_leads_followUpAt_idx" ON "contact_leads"("followUpAt");

-- CreateIndex
CREATE INDEX "contact_leads_emailNormalized_idx" ON "contact_leads"("emailNormalized");

-- CreateIndex
CREATE INDEX "contact_leads_phoneNormalized_idx" ON "contact_leads"("phoneNormalized");

-- AddForeignKey
ALTER TABLE "contact_leads" ADD CONSTRAINT "contact_leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_leads" ADD CONSTRAINT "contact_leads_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "contact_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "contact_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignment_rules" ADD CONSTRAINT "lead_assignment_rules_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

