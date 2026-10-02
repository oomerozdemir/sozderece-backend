-- Panel Turu (guided tour) kalıcı tamamlanma zamanı. Null = öğrenci paneli
-- ilk kez görüyor, karşılama otomatik teklif edilir.
ALTER TABLE "User" ADD COLUMN "panelTourCompletedAt" TIMESTAMP(3);
