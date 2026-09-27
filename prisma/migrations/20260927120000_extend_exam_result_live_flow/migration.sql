-- Deneme Merkezi: ExamResult'a canlı zamanlayıcı + hedef + öz analiz alanları
-- eklenir. Tamamı nullable/varsayılanlı — mevcut koç-girişli satırlar
-- entryMode='MANUAL', status='COMPLETED' varsayılanlarını alır, hiçbir
-- mevcut davranış değişmez.
ALTER TABLE "ExamResult"
  ADD COLUMN "entryMode" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "branch" TEXT,
  ADD COLUMN "totalQuestions" INTEGER,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "finishedAt" TIMESTAMP(3),
  ADD COLUMN "durationSeconds" INTEGER,
  ADD COLUMN "targetNet" DOUBLE PRECISION,
  ADD COLUMN "targetDurationMinutes" INTEGER,
  ADD COLUMN "focusAreas" JSONB,
  ADD COLUMN "totalCorrect" INTEGER,
  ADD COLUMN "totalWrong" INTEGER,
  ADD COLUMN "totalBlank" INTEGER,
  ADD COLUMN "difficultyReasons" JSONB,
  ADD COLUMN "didWell" TEXT,
  ADD COLUMN "nextImprovement" TEXT,
  ADD COLUMN "studentNote" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'COMPLETED';

CREATE INDEX "ExamResult_studentId_entryMode_status_idx" ON "ExamResult"("studentId", "entryMode", "status");

-- Aynı öğrencinin aynı anda birden fazla bitmemiş (IN_PROGRESS/RESULT_PENDING/
-- ANALYSIS_PENDING) LIVE denemesi olamaz — DB seviyesinde, eşzamanlı
-- isteklerde de güvenli (application-code findFirst guard'ına ek olarak,
-- onun yerine değil). Mevcut satırlar (entryMode='MANUAL' ya da
-- status='COMPLETED') bu kısıtın dışında kalır.
CREATE UNIQUE INDEX "ExamResult_one_active_live_per_student"
  ON "ExamResult" ("studentId")
  WHERE ("entryMode" = 'LIVE' AND "status" IN ('IN_PROGRESS', 'RESULT_PENDING', 'ANALYSIS_PENDING'));
