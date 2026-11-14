-- AlterTable
ALTER TABLE "Coach" ADD COLUMN "headCoachUserId" INTEGER;

-- CreateIndex
CREATE INDEX "Coach_headCoachUserId_idx" ON "Coach"("headCoachUserId");

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_headCoachUserId_fkey" FOREIGN KEY ("headCoachUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
