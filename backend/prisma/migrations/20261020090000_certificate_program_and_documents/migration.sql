-- Certificate program (separate module), business documents, email log, receipt PDFs.
-- ADDITIVE: new enums/values, tables and nullable columns. The only change to existing columns is
-- payments.applicationId / invoices.applicationId becoming nullable (no data changes); a CHECK
-- constraint keeps every existing and new row tied to exactly one of an admission or a program enrollment.

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramEnrollmentStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BusinessDocumentType" AS ENUM ('QUOTATION', 'PROPOSAL', 'AGREEMENT', 'INVOICE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "BusinessDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'DECLINED', 'SIGNED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'SUPERSEDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FilePurpose" ADD VALUE 'GENERATED_DOCUMENT';
ALTER TYPE "FilePurpose" ADD VALUE 'SIGNED_DOCUMENT';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "pdfFileId" TEXT,
ADD COLUMN     "programEnrollmentId" TEXT,
ALTER COLUMN "applicationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "disputeStatus" TEXT,
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "programEnrollmentId" TEXT,
ALTER COLUMN "applicationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "certificate_programs" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "feePaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "passPercent" INTEGER NOT NULL DEFAULT 60,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "questionsPerAttempt" INTEGER,
    "timeLimitMinutes" INTEGER NOT NULL DEFAULT 30,
    "certificateTitle" TEXT NOT NULL DEFAULT 'Certificate of Completion',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_lessons" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "videoUrl" TEXT,
    "minMinutes" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_questions" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_enrollments" (
    "id" TEXT NOT NULL,
    "enrollmentNumber" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "ProgramEnrollmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "feePaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "extraAttempts" INTEGER NOT NULL DEFAULT 0,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_lesson_progress" (
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "program_lesson_progress_pkey" PRIMARY KEY ("enrollmentId","lessonId")
);

-- CreateTable
CREATE TABLE "program_attempts" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "questionIds" JSONB NOT NULL,
    "answers" JSONB,
    "correctCount" INTEGER,
    "scorePercent" INTEGER,
    "passed" BOOLEAN,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "program_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_certificates" (
    "id" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "programTitle" TEXT NOT NULL,
    "certificateTitle" TEXT NOT NULL,
    "scorePercent" INTEGER NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "pdfFileId" TEXT,

    CONSTRAINT "program_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_profile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "legalName" TEXT NOT NULL DEFAULT '',
    "tradeName" TEXT NOT NULL DEFAULT 'Globalantic',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "stateCode" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'India',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
    "gstin" TEXT NOT NULL DEFAULT '',
    "pan" TEXT NOT NULL DEFAULT '',
    "registrationNo" TEXT NOT NULL DEFAULT '',
    "defaultGstRateBp" INTEGER NOT NULL DEFAULT 1800,
    "bankDetails" TEXT NOT NULL DEFAULT '',
    "upiId" TEXT NOT NULL DEFAULT '',
    "signatoryName" TEXT NOT NULL DEFAULT '',
    "signatoryTitle" TEXT NOT NULL DEFAULT '',
    "footerNote" TEXT NOT NULL DEFAULT '',
    "numbering" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "business_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'India',
    "gstin" TEXT,
    "notes" TEXT,
    "leadId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "type" "BusinessDocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "items" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "terms" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_documents" (
    "id" TEXT NOT NULL,
    "type" "BusinessDocumentType" NOT NULL,
    "status" "BusinessDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "number" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "revisionOfId" TEXT,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "clientId" TEXT,
    "leadId" TEXT,
    "studentId" TEXT,
    "templateId" TEXT,
    "party" JSONB NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "sections" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "terms" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "applyGst" BOOLEAN NOT NULL DEFAULT false,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "subtotalPaise" INTEGER NOT NULL DEFAULT 0,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL DEFAULT 0,
    "amountPaidPaise" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "paymentDate" TIMESTAMP(3),
    "snapshot" JSONB,
    "pdfFileId" TEXT,
    "createdById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "outcomeNote" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedById" TEXT,
    "signedNote" TEXT,
    "signedCopyFileId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "attachments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificate_programs_slug_key" ON "certificate_programs"("slug");

-- CreateIndex
CREATE INDEX "certificate_programs_status_idx" ON "certificate_programs"("status");

-- CreateIndex
CREATE INDEX "program_lessons_programId_position_idx" ON "program_lessons"("programId", "position");

-- CreateIndex
CREATE INDEX "program_questions_programId_idx" ON "program_questions"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "program_enrollments_enrollmentNumber_key" ON "program_enrollments"("enrollmentNumber");

-- CreateIndex
CREATE INDEX "program_enrollments_status_idx" ON "program_enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "program_enrollments_programId_studentId_key" ON "program_enrollments"("programId", "studentId");

-- CreateIndex
CREATE INDEX "program_attempts_enrollmentId_idx" ON "program_attempts"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "program_certificates_certificateNumber_key" ON "program_certificates"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "program_certificates_verificationCode_key" ON "program_certificates"("verificationCode");

-- CreateIndex
CREATE UNIQUE INDEX "program_certificates_enrollmentId_key" ON "program_certificates"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "program_certificates_pdfFileId_key" ON "program_certificates"("pdfFileId");

-- CreateIndex
CREATE INDEX "program_certificates_studentId_idx" ON "program_certificates"("studentId");

-- CreateIndex
CREATE INDEX "program_certificates_programId_idx" ON "program_certificates"("programId");

-- CreateIndex
CREATE INDEX "business_clients_leadId_idx" ON "business_clients"("leadId");

-- CreateIndex
CREATE INDEX "business_clients_email_idx" ON "business_clients"("email");

-- CreateIndex
CREATE INDEX "document_templates_type_idx" ON "document_templates"("type");

-- CreateIndex
CREATE UNIQUE INDEX "business_documents_number_key" ON "business_documents"("number");

-- CreateIndex
CREATE INDEX "business_documents_type_status_idx" ON "business_documents"("type", "status");

-- CreateIndex
CREATE INDEX "business_documents_clientId_idx" ON "business_documents"("clientId");

-- CreateIndex
CREATE INDEX "business_documents_leadId_idx" ON "business_documents"("leadId");

-- CreateIndex
CREATE INDEX "business_documents_studentId_idx" ON "business_documents"("studentId");

-- CreateIndex
CREATE INDEX "business_documents_createdById_idx" ON "business_documents"("createdById");

-- CreateIndex
CREATE INDEX "email_logs_entityType_entityId_idx" ON "email_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "email_logs_status_createdAt_idx" ON "email_logs"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_pdfFileId_key" ON "invoices"("pdfFileId");

-- CreateIndex
CREATE INDEX "payments_programEnrollmentId_idx" ON "payments"("programEnrollmentId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_programEnrollmentId_fkey" FOREIGN KEY ("programEnrollmentId") REFERENCES "program_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_programEnrollmentId_fkey" FOREIGN KEY ("programEnrollmentId") REFERENCES "program_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_lessons" ADD CONSTRAINT "program_lessons_programId_fkey" FOREIGN KEY ("programId") REFERENCES "certificate_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_questions" ADD CONSTRAINT "program_questions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "certificate_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "certificate_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_enrollments" ADD CONSTRAINT "program_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_lesson_progress" ADD CONSTRAINT "program_lesson_progress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "program_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_lesson_progress" ADD CONSTRAINT "program_lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "program_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_attempts" ADD CONSTRAINT "program_attempts_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "program_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_certificates" ADD CONSTRAINT "program_certificates_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "program_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_certificates" ADD CONSTRAINT "program_certificates_programId_fkey" FOREIGN KEY ("programId") REFERENCES "certificate_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_certificates" ADD CONSTRAINT "program_certificates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_certificates" ADD CONSTRAINT "program_certificates_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_clients" ADD CONSTRAINT "business_clients_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "contact_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "business_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "business_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "business_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "contact_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_signedCopyFileId_fkey" FOREIGN KEY ("signedCopyFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Exactly one owner per payment / receipt (all existing rows have applicationId set, so they pass).
ALTER TABLE "payments" ADD CONSTRAINT "payments_one_purpose_check" CHECK (("applicationId" IS NULL) <> ("programEnrollmentId" IS NULL));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_one_purpose_check" CHECK (("applicationId" IS NULL) <> ("programEnrollmentId" IS NULL));

-- Money and assessment sanity.
ALTER TABLE "certificate_programs" ADD CONSTRAINT "certificate_programs_fee_check" CHECK ("feePaise" >= 0 AND "passPercent" BETWEEN 1 AND 100 AND "maxAttempts" >= 1);
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_money_check" CHECK ("totalPaise" >= 0 AND "amountPaidPaise" >= 0);
