-- Öğrenci Paneli (Faz 1): erişim bayrağı + haftalık program, deneme sonucu,
-- kaynak kütüphanesi ve duyuru modelleri. Tüm alanlar opsiyonel/varsayılanlı,
-- mevcut veriye dokunmaz.

ALTER TABLE "User" ADD COLUMN "panelBetaAccess" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StudyPlan" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudyPlanItem" (
    "id" SERIAL NOT NULL,
    "studyPlanId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT,
    "durationMin" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StudyPlanItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamResult" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "examName" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "subjectNets" JSONB NOT NULL,
    "totalNet" DOUBLE PRECISION,
    "ranking" INTEGER,
    "notes" TEXT,
    "enteredById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Resource" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "targetTrack" TEXT,
    "targetGrade" TEXT,
    "subject" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Announcement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetTrack" TEXT,
    "targetGrade" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudyPlan_studentId_weekStart_idx" ON "StudyPlan"("studentId", "weekStart");
CREATE INDEX "ExamResult_studentId_examDate_idx" ON "ExamResult"("studentId", "examDate");

ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudyPlanItem" ADD CONSTRAINT "StudyPlanItem_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
