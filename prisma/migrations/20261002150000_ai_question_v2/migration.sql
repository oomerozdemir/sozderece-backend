-- AI Soru Asistanı V2 — yapısal öğrenme sinyalleri (AiQuestion'a ek nullable
-- kolonlar) + ayrı doğrulama (verification) modeli. Tamamı additive/nullable
-- — eski kayıtlar etkilenmez, hiçbir backfill yapılmaz.

ALTER TABLE "AiQuestion"
  ADD COLUMN "subtopic" TEXT,
  ADD COLUMN "questionType" TEXT,
  ADD COLUMN "difficulty" TEXT,
  ADD COLUMN "likelyStruggle" TEXT,
  ADD COLUMN "errorType" TEXT,
  ADD COLUMN "struggleSource" TEXT,
  ADD COLUMN "skills" JSONB,
  ADD COLUMN "understandingStatus" TEXT;

CREATE INDEX "AiQuestion_studentId_subject_topic_createdAt_idx"
  ON "AiQuestion"("studentId", "subject", "topic", "createdAt");

CREATE TABLE "AiQuestionVerification" (
  "id" SERIAL NOT NULL,
  "questionId" INTEGER NOT NULL,
  "studentId" INTEGER NOT NULL,
  "promptText" TEXT,
  "expectedAnswerJson" JSONB,
  "studentAnswer" TEXT,
  "evaluationStatus" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "subject" TEXT,
  "topic" TEXT,
  "subtopic" TEXT,
  "skills" JSONB,
  "model" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "estimatedCostUsd" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3),

  CONSTRAINT "AiQuestionVerification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiQuestionVerification"
  ADD CONSTRAINT "AiQuestionVerification_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "AiQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiQuestionVerification"
  ADD CONSTRAINT "AiQuestionVerification_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "AiQuestionVerification_studentId_createdAt_idx"
  ON "AiQuestionVerification"("studentId", "createdAt");

CREATE INDEX "AiQuestionVerification_questionId_idx"
  ON "AiQuestionVerification"("questionId");

-- Bir soru için aynı anda yalnızca TEK cevaplanmamış (evaluationStatus IS
-- NULL) doğrulama kaydı olabilir — DB seviyesinde garanti, application-code
-- findFirst guard'ına ek olarak (onun yerine değil). Prisma DSL'i koşullu
-- unique index ifade edemediği için (ExamResult_one_active_live_per_student
-- ile aynı desen) burada elle yazılıyor.
CREATE UNIQUE INDEX "AiQuestionVerification_questionId_unanswered_key"
  ON "AiQuestionVerification"("questionId")
  WHERE ("evaluationStatus" IS NULL);
