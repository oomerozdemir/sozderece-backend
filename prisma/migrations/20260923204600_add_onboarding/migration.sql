-- Satın alma sonrası onboarding (tanışma formu + aşama takibi)
CREATE TABLE "Onboarding" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "packageSlug" TEXT,
    "packageName" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'payment_completed',
    "stageTimes" JSONB NOT NULL DEFAULT '{}',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Onboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Onboarding_orderId_key" ON "Onboarding"("orderId");
CREATE INDEX "Onboarding_userId_idx" ON "Onboarding"("userId");
CREATE INDEX "Onboarding_stage_idx" ON "Onboarding"("stage");

ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
