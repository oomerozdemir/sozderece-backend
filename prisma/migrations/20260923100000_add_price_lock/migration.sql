-- Öğrencinin başladığı fiyatı koruyan kilitli fiyat sistemi
ALTER TABLE "Package" ADD COLUMN "requiresPriceLock" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PriceLock" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "userId" INTEGER,
    "unitPrice" INTEGER NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceLock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceLock_email_idx" ON "PriceLock"("email");
CREATE INDEX "PriceLock_phone_idx" ON "PriceLock"("phone");
