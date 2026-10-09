-- CreateTable
CREATE TABLE "StudentResource" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "assignedByCoachId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "subject" TEXT,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentResource_studentId_archivedAt_idx" ON "StudentResource"("studentId", "archivedAt");

-- CreateIndex
CREATE INDEX "StudentResource_studentId_examType_idx" ON "StudentResource"("studentId", "examType");

-- CreateIndex
CREATE INDEX "StudentResource_assignedByCoachId_idx" ON "StudentResource"("assignedByCoachId");

-- AddForeignKey
ALTER TABLE "StudentResource" ADD CONSTRAINT "StudentResource_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentResource" ADD CONSTRAINT "StudentResource_assignedByCoachId_fkey" FOREIGN KEY ("assignedByCoachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
