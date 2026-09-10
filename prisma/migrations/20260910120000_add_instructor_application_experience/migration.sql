-- Eğitmen/koç başvurusu: adayın deneyimleri ve yüklediği örnek program
-- dosyalarının URL listesi (JSON dizi). İkisi de opsiyonel, mevcut satırlar etkilenmez.
ALTER TABLE "InstructorApplication" ADD COLUMN "experience" TEXT;
ALTER TABLE "InstructorApplication" ADD COLUMN "samplePrograms" TEXT;
