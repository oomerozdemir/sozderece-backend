-- Koç Paneli Turu aşaması. Null = hiç başlamadı. 0 = koçun hiç öğrencisi
-- yokken sadece dashboard bölümü gösterildi, öğrenci workspace bölümü
-- beklemede. COACH_TOUR_CURRENT_VERSION (coach.controller.js) = tur tamamen
-- tamamlandı.
ALTER TABLE "User" ADD COLUMN "coachTourCompletedVersion" INTEGER;
