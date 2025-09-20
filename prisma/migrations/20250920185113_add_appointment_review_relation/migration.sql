/*
  Warnings:

  - A unique constraint covering the columns `[appointmentId]` on the table `TeacherReview` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "TeacherReview" ADD COLUMN     "appointmentId" TEXT;

-- CreateIndex
CREATE INDEX "TeacherReview_appointmentId_idx" ON "TeacherReview"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherReview_appointmentId_key" ON "TeacherReview"("appointmentId");

-- AddForeignKey
ALTER TABLE "TeacherReview" ADD CONSTRAINT "TeacherReview_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
