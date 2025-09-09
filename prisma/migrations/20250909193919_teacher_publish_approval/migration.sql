/*
  Warnings:

  - You are about to drop the column `isApproved` on the `TeacherProfile` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "TeacherProfile" DROP COLUMN "isApproved",
ADD COLUMN     "publishStatus" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" INTEGER,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ALTER COLUMN "isPublic" SET DEFAULT false;

-- CreateIndex
CREATE INDEX "TeacherProfile_publishStatus_idx" ON "TeacherProfile"("publishStatus");

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
