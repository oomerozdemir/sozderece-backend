-- CreateTable
CREATE TABLE "TeacherLesson" (
    "id" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "priceOnline" INTEGER,
    "priceF2F" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherLesson_teacherProfileId_idx" ON "TeacherLesson"("teacherProfileId");

-- CreateIndex
CREATE INDEX "TeacherLesson_subject_idx" ON "TeacherLesson"("subject");

-- CreateIndex
CREATE INDEX "TeacherLesson_topic_idx" ON "TeacherLesson"("topic");

-- AddForeignKey
ALTER TABLE "TeacherLesson" ADD CONSTRAINT "TeacherLesson_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
