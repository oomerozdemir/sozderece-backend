-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PaymentMeta" ALTER COLUMN "userId" DROP NOT NULL;
