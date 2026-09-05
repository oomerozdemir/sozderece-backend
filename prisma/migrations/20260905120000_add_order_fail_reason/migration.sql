-- Ödeme başarısız olduğunda PayTR'nin gönderdiği gerçek red sebebi hiçbir
-- yerde saklanmıyordu (sadece status="failed" yazılıyordu) — bu, gerçek bir
-- müşteri ödemesinin neden reddedildiğini tespit etmeyi imkansız kılıyordu.
ALTER TABLE "Order" ADD COLUMN "failReason" TEXT;
