-- CreateEnum
CREATE TYPE "RequestMode" AS ENUM ('ONLINE', 'FACE_TO_FACE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PACKAGE_SELECTED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "StudentLessonRequest" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "mode" "RequestMode" NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "locationNote" TEXT,
    "note" TEXT,
    "status" "RequestStatus" NOT NULL,
    "packageSlug" TEXT,
    "packageTitle" TEXT,
    "packageUnitPrice" INTEGER,
    "orderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentLessonRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentLessonRequest_orderId_key" ON "StudentLessonRequest"("orderId");

-- CreateIndex
CREATE INDEX "StudentLessonRequest_studentId_idx" ON "StudentLessonRequest"("studentId");

-- CreateIndex
CREATE INDEX "StudentLessonRequest_teacherProfileId_idx" ON "StudentLessonRequest"("teacherProfileId");

-- CreateIndex
CREATE INDEX "StudentLessonRequest_status_createdAt_idx" ON "StudentLessonRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentLessonRequest" ADD CONSTRAINT "StudentLessonRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLessonRequest" ADD CONSTRAINT "StudentLessonRequest_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLessonRequest" ADD CONSTRAINT "StudentLessonRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
