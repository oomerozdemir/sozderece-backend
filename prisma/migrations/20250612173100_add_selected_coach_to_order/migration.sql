/*
  Warnings:

  - You are about to drop the column `selectedCoach` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "selectedCoach",
ADD COLUMN     "selectedCoachId" INTEGER;

-- CreateTable
CREATE TABLE "Coach" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT NOT NULL,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_selectedCoachId_fkey" FOREIGN KEY ("selectedCoachId") REFERENCES "Coach"("id") ON DELETE SET NULL ON UPDATE CASCADE;
