-- CreateTable
CREATE TABLE "ExamReviewItem" (
    "id" SERIAL NOT NULL,
    "examResultId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "ExamReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamReviewItem_examResultId_idx" ON "ExamReviewItem"("examResultId");

-- AddForeignKey
ALTER TABLE "ExamReviewItem" ADD CONSTRAINT "ExamReviewItem_examResultId_fkey" FOREIGN KEY ("examResultId") REFERENCES "ExamResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
