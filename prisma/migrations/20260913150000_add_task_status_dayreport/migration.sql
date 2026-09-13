-- StudyPlanItem: completed(Boolean) -> status(String: pending/done/partial/stuck)
-- Mevcut veriyi kaybetmeden taşı.
ALTER TABLE "StudyPlanItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "StudyPlanItem" ADD COLUMN "statusAt" TIMESTAMP(3);
UPDATE "StudyPlanItem" SET "status" = 'done', "statusAt" = "completedAt" WHERE "completed" = true;
ALTER TABLE "StudyPlanItem" DROP COLUMN "completed";
ALTER TABLE "StudyPlanItem" DROP COLUMN "completedAt";

-- Günlük otomatik özet ("Z-Raporu")
CREATE TABLE "DayReport" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalTasks" INTEGER NOT NULL,
    "doneTasks" INTEGER NOT NULL,
    "partialTasks" INTEGER NOT NULL,
    "stuckTasks" INTEGER NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DayReport_studentId_date_key" ON "DayReport"("studentId", "date");
ALTER TABLE "DayReport" ADD CONSTRAINT "DayReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
