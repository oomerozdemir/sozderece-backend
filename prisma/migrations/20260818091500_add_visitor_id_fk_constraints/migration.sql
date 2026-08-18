-- AddForeignKey: visitorId kolonları önceki migration'da eklenmişti ama
-- Visitor tablosuna referans veren FK kısıtı eksik kalmıştı (sadece
-- visitorSessionId FK'si eklenmişti). Bu migration eksik kısıtları tamamlar.
ALTER TABLE "Order" ADD CONSTRAINT "Order_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentMeta" ADD CONSTRAINT "PaymentMeta_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
