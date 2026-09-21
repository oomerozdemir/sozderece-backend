-- "Bugünüm" ekranı: görev tamamlanınca hızlı zorluk geri bildirimi + not,
-- "Bugün Yapamadım" akışında sebep
ALTER TABLE "StudyPlanItem"
  ADD COLUMN "feeling" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "notCompletedReason" TEXT;
