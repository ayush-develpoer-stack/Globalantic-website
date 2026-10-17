-- Admin integration (2026-10-17). ADDITIVE ONLY: 2 FilePurpose values, 4 nullable columns on
-- admission_applications, 2 new tables (user_permission_grants, user_notes). No drops/renames/rewrites.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FilePurpose" ADD VALUE 'COURSE_IMAGE';
ALTER TYPE "FilePurpose" ADD VALUE 'CMS_IMAGE';

-- AlterTable
ALTER TABLE "admission_applications" ADD COLUMN     "infoRequest" TEXT,
ADD COLUMN     "infoRequestedAt" TIMESTAMP(3),
ADD COLUMN     "infoRespondedAt" TIMESTAMP(3),
ADD COLUMN     "infoResponse" TEXT;

-- CreateTable
CREATE TABLE "user_permission_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_grants_userId_permission_key" ON "user_permission_grants"("userId", "permission");

-- CreateIndex
CREATE INDEX "user_notes_userId_createdAt_idx" ON "user_notes"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

