-- Intern examinations (Marketing & Sales) + uploaded learning-material files.
-- ADDITIVE ONLY: new enums/tables, one new enum value, one new nullable column,
-- and learning_materials.url relaxed to nullable (no data is changed or removed).

-- CreateEnum
CREATE TYPE "ExamTrack" AS ENUM ('MARKETING', 'SALES');

-- CreateEnum
CREATE TYPE "ExamKind" AS ENUM ('TEST', 'PRACTICAL', 'INTERVIEW');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExamQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'DESCRIPTIVE');

-- CreateEnum
CREATE TYPE "ExamResultVisibility" AS ENUM ('IMMEDIATE', 'ON_RELEASE');

-- CreateEnum
CREATE TYPE "ExamAssignmentTarget" AS ENUM ('STUDENT', 'BATCH', 'INSTITUTION', 'PROGRAM');

-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EVALUATED');

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'LEARNING_MATERIAL';

-- AlterTable
ALTER TABLE "learning_materials" ADD COLUMN     "fileId" TEXT,
ALTER COLUMN "url" DROP NOT NULL;

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL,
    "track" "ExamTrack" NOT NULL,
    "topic" TEXT NOT NULL,
    "type" "ExamQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "correctOptionIds" TEXT[],
    "marks" INTEGER NOT NULL DEFAULT 1,
    "guidance" TEXT,
    "explanation" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    "eligibilityNote" TEXT,
    "track" "ExamTrack" NOT NULL,
    "kind" "ExamKind" NOT NULL DEFAULT 'TEST',
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "passPercent" INTEGER NOT NULL DEFAULT 50,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "questionsPerAttempt" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT true,
    "resultVisibility" "ExamResultVisibility" NOT NULL DEFAULT 'ON_RELEASE',
    "revealAnswers" BOOLEAN NOT NULL DEFAULT false,
    "negativeMarkPercent" INTEGER NOT NULL DEFAULT 0,
    "interviewMaxMarks" INTEGER,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "resultsReleasedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_question_links" (
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "exam_question_links_pkey" PRIMARY KEY ("examId","questionId")
);

-- CreateTable
CREATE TABLE "exam_assignments" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "target" "ExamAssignmentTarget" NOT NULL,
    "studentId" TEXT,
    "batchId" TEXT,
    "courseId" TEXT,
    "institution" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),
    "evaluatedById" TEXT,
    "questionIds" TEXT[],
    "optionOrder" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "maxScore" INTEGER NOT NULL,
    "passed" BOOLEAN,
    "feedback" TEXT,
    "focusLossCount" INTEGER NOT NULL DEFAULT 0,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[],
    "text" TEXT,
    "autoMarks" DOUBLE PRECISION,
    "manualMarks" DOUBLE PRECISION,
    "evaluatorComment" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_retake_grants" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_retake_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_questions_track_topic_idx" ON "exam_questions"("track", "topic");

-- CreateIndex
CREATE INDEX "exams_status_track_idx" ON "exams"("status", "track");

-- CreateIndex
CREATE INDEX "exam_question_links_questionId_idx" ON "exam_question_links"("questionId");

-- CreateIndex
CREATE INDEX "exam_assignments_examId_idx" ON "exam_assignments"("examId");

-- CreateIndex
CREATE INDEX "exam_assignments_studentId_idx" ON "exam_assignments"("studentId");

-- CreateIndex
CREATE INDEX "exam_assignments_batchId_idx" ON "exam_assignments"("batchId");

-- CreateIndex
CREATE INDEX "exam_assignments_courseId_idx" ON "exam_assignments"("courseId");

-- CreateIndex
CREATE INDEX "exam_attempts_studentId_idx" ON "exam_attempts"("studentId");

-- CreateIndex
CREATE INDEX "exam_attempts_examId_status_idx" ON "exam_attempts"("examId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_examId_studentId_attemptNo_key" ON "exam_attempts"("examId", "studentId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "exam_answers_attemptId_questionId_key" ON "exam_answers"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "exam_retake_grants_examId_studentId_idx" ON "exam_retake_grants"("examId", "studentId");

-- AddForeignKey
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_links" ADD CONSTRAINT "exam_question_links_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_links" ADD CONSTRAINT "exam_question_links_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_retake_grants" ADD CONSTRAINT "exam_retake_grants_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_retake_grants" ADD CONSTRAINT "exam_retake_grants_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

