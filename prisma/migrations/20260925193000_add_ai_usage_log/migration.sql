-- Koç panelinde haftalık program görseli/PDF'ini Claude vision ile okuma
-- özelliği için maliyet/operasyon logu. FK yok (StudyPlan.createdById ile
-- aynı gevşek-referans deseni) — silinen bir kullanıcı log geçmişini
-- bloklamasın/cascade silmesin.
CREATE TABLE "AiUsageLog" (
    "id" SERIAL NOT NULL,
    "feature" TEXT NOT NULL DEFAULT 'study_plan_image',
    "studentId" INTEGER,
    "coachId" INTEGER,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reviewStatus" TEXT,
    "errorCode" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheCreationInputTokens" INTEGER,
    "cacheReadInputTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "fileHash" TEXT,
    "fileMimeType" TEXT,
    "rowsExtracted" INTEGER,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsageLog_studentId_feature_fileHash_idx" ON "AiUsageLog"("studentId", "feature", "fileHash");
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");
CREATE INDEX "AiUsageLog_coachId_idx" ON "AiUsageLog"("coachId");
