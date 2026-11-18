-- Yeni öğrenci paneli artık varsayılan olarak HERKESE açık — admin
-- "Kullanıcılar" sekmesinden bireysel öğrenciler için bunu KAPATIP eski
-- panele döndürebilir (artık "izin ver" değil, "devre dışı bırak" anahtarı).
ALTER TABLE "User" ALTER COLUMN "panelBetaAccess" SET DEFAULT true;

-- Bu değişiklikten önce oluşturulmuş, hâlâ eski varsayılan (false) değerini
-- taşıyan öğrenciler geriye düşmesin diye tek seferlik geriye dönük düzeltme.
UPDATE "User" SET "panelBetaAccess" = true WHERE role = 'student' AND "panelBetaAccess" = false;
