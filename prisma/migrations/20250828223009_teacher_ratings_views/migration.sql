-- AlterTable
ALTER TABLE "TeacherProfile" ADD COLUMN     "isApproved" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ratingAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TeacherReview" (
    "id" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "userId" INTEGER,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherReview_teacherProfileId_idx" ON "TeacherReview"("teacherProfileId");

-- CreateIndex
CREATE INDEX "TeacherReview_rating_idx" ON "TeacherReview"("rating");

-- CreateIndex
CREATE INDEX "TeacherProfile_viewCount_idx" ON "TeacherProfile"("viewCount");

-- CreateIndex
CREATE INDEX "TeacherProfile_ratingAverage_idx" ON "TeacherProfile"("ratingAverage");

-- CreateIndex
CREATE INDEX "TeacherProfile_ratingCount_idx" ON "TeacherProfile"("ratingCount");

-- AddForeignKey
ALTER TABLE "TeacherReview" ADD CONSTRAINT "TeacherReview_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherReview" ADD CONSTRAINT "TeacherReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
