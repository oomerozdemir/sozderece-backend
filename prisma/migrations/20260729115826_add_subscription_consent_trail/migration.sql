-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "consentIp" TEXT,
ADD COLUMN "consentAt" TIMESTAMP(3),
ADD COLUMN "consentText" TEXT;
