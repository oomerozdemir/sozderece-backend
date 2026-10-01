-- AI Soru Asistanı: öğrencinin yüklediği soru fotoğrafı + Claude'un ürettiği
-- yapılandırılmış çözüm (AiQuestion), ve her soruya bağlı en fazla 3
-- follow-up (AiQuestionFollowup). Günlük kota (yalnızca COMPLETED) ve günlük
-- attempt tavanı (her gerçek Claude çağrısı) ayrı bir sayaç kolonu YOK,
-- status üzerinden uygulama kodunda canlı COUNT ile hesaplanır
-- (bkz. utils/aiQuestionQuota.js).
CREATE TABLE "AiQuestion" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "subject" TEXT,
    "topic" TEXT,
    "imageUrl" TEXT,
    "imageHash" TEXT NOT NULL,
    "questionSummary" TEXT,
    "concept" TEXT,
    "steps" JSONB,
    "answer" TEXT,
    "option" TEXT,
    "tip" TEXT,
    "status" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "followupCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiQuestionFollowup" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "stepIndex" INTEGER,
    "responseText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiQuestionFollowup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiQuestion_studentId_createdAt_idx" ON "AiQuestion"("studentId", "createdAt");
CREATE INDEX "AiQuestion_studentId_status_createdAt_idx" ON "AiQuestion"("studentId", "status", "createdAt");
CREATE INDEX "AiQuestion_studentId_imageHash_idx" ON "AiQuestion"("studentId", "imageHash");

CREATE INDEX "AiQuestionFollowup_questionId_status_createdAt_idx" ON "AiQuestionFollowup"("questionId", "status", "createdAt");

ALTER TABLE "AiQuestion" ADD CONSTRAINT "AiQuestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiQuestionFollowup" ADD CONSTRAINT "AiQuestionFollowup_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AiQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
