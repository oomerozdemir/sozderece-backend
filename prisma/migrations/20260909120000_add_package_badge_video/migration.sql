-- Çoklu paket-kartı vitrini (PricingSection) için: öne-çıkarma rozeti ve
-- pakete özel tanıtım videosu. İkisi de opsiyonel, mevcut satırlar etkilenmez.
ALTER TABLE "Package" ADD COLUMN "badge" TEXT;
ALTER TABLE "Package" ADD COLUMN "videoUrl" TEXT;
