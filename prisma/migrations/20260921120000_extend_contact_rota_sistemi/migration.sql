-- Ücretsiz Ön Görüşme formu "Rota Sistemi" veri toplama alanları
ALTER TABLE "Contact" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "Contact"
  ADD COLUMN "role" TEXT,
  ADD COLUMN "examType" TEXT,
  ADD COLUMN "gradeStatus" TEXT,
  ADD COLUMN "challenges" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "challengesOther" TEXT,
  ADD COLUMN "studyRoutine" TEXT,
  ADD COLUMN "lastExamResult" TEXT,
  ADD COLUMN "goal" TEXT,
  ADD COLUMN "supportAreas" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "supportAreasOther" TEXT;
