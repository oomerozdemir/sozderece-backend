-- DayReport: gerçek çalışma süresi (Pomodoro'dan)
ALTER TABLE "DayReport" ADD COLUMN "actualStudyMinutes" INTEGER NOT NULL DEFAULT 0;

-- PomodoroSession
CREATE TABLE "PomodoroSession" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "studyPlanItemId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "plannedSeconds" INTEGER NOT NULL DEFAULT 1500,
    "actualSeconds" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PomodoroSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PomodoroSession_studentId_startedAt_idx" ON "PomodoroSession"("studentId", "startedAt");

ALTER TABLE "PomodoroSession" ADD CONSTRAINT "PomodoroSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PomodoroSession" ADD CONSTRAINT "PomodoroSession_studyPlanItemId_fkey" FOREIGN KEY ("studyPlanItemId") REFERENCES "StudyPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SosAlert
CREATE TABLE "SosAlert" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,

    CONSTRAINT "SosAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SosAlert_studentId_createdAt_idx" ON "SosAlert"("studentId", "createdAt");
CREATE INDEX "SosAlert_resolvedAt_idx" ON "SosAlert"("resolvedAt");

ALTER TABLE "SosAlert" ADD CONSTRAINT "SosAlert_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
