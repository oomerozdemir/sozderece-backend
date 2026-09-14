CREATE TABLE "CoachNote" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "coachId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoachNote_studentId_createdAt_idx" ON "CoachNote"("studentId", "createdAt");

ALTER TABLE "CoachNote" ADD CONSTRAINT "CoachNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
