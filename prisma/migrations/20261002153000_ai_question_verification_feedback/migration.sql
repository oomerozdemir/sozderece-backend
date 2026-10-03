-- AiQuestionVerification'a öğrenciye gösterilecek değerlendirme geri
-- bildirimi alanı eklenir (ilk migration'da gözden kaçmıştı). expectedAnswerJson
-- gibi server-only değil — bu alan bilerek öğrenci-facing response'a döner.
ALTER TABLE "AiQuestionVerification"
  ADD COLUMN "feedback" TEXT;
