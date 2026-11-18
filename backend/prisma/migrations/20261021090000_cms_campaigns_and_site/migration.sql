-- CMS completion: blog/project archive + publication dates, project services/links/client approval,
-- service page fields, Google Maps settings, campaign landing pages. ADDITIVE ONLY.

-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "portfolio_projects" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "clientApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "links" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "services" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "audience" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "heroVariant" TEXT,
ADD COLUMN     "industries" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "mapEmbedUrl" TEXT,
ADD COLUMN     "mapUrl" TEXT;

-- CreateTable
CREATE TABLE "landing_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "subheadline" TEXT NOT NULL,
    "benefits" JSONB NOT NULL DEFAULT '[]',
    "ctaLabel" TEXT NOT NULL DEFAULT 'Get a Free Consultation',
    "priceNote" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "landing_pages_slug_key" ON "landing_pages"("slug");

-- CreateIndex
CREATE INDEX "landing_pages_published_idx" ON "landing_pages"("published");


-- Backfill: existing published projects keep a publication date (their creation date).
UPDATE "portfolio_projects" SET "publishedAt" = "createdAt" WHERE "published" = true AND "publishedAt" IS NULL;
