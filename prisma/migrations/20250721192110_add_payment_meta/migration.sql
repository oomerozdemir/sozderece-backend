-- CreateTable
CREATE TABLE "PaymentMeta" (
    "id" SERIAL NOT NULL,
    "merchantOid" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "cart" JSONB NOT NULL,
    "billingInfo" JSONB NOT NULL,
    "packageName" TEXT NOT NULL,
    "discountRate" INTEGER NOT NULL,
    "couponCode" TEXT,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMeta_merchantOid_key" ON "PaymentMeta"("merchantOid");

-- AddForeignKey
ALTER TABLE "PaymentMeta" ADD CONSTRAINT "PaymentMeta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
