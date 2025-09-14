-- DropIndex
DROP INDEX "StudentLessonRequest_orderId_key";

-- AlterTable
ALTER TABLE "PaymentMeta" ADD COLUMN     "requestId" VARCHAR(191);

-- AlterTable
ALTER TABLE "StudentLessonRequest" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- CreateIndex
CREATE INDEX "PaymentMeta_requestId_idx" ON "PaymentMeta"("requestId");

-- CreateIndex
CREATE INDEX "StudentLessonRequest_orderId_idx" ON "StudentLessonRequest"("orderId");
