-- Admin notification centre (platform events fanned out to staff notifications, private email settings),
-- portfolio cover image + alt text, blog cover alt text, secondary public email. ADDITIVE ONLY.

-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "coverImageAlt" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'info';

-- AlterTable
ALTER TABLE "portfolio_projects" ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "coverImageAlt" TEXT;

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "secondaryEmail" TEXT;

-- CreateTable
CREATE TABLE "admin_events" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "emailStatus" TEXT NOT NULL DEFAULT 'NONE',
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailMinSeverity" TEXT NOT NULL DEFAULT 'important',
    "mutedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retentionDays" INTEGER NOT NULL DEFAULT 180,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_events_dedupeKey_key" ON "admin_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "admin_events_category_createdAt_idx" ON "admin_events"("category", "createdAt");

-- CreateIndex
CREATE INDEX "admin_events_emailStatus_createdAt_idx" ON "admin_events"("emailStatus", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_category_idx" ON "notifications"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_eventId_key" ON "notifications"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "admin_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

