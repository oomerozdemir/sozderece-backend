/*
  Warnings:

  - You are about to drop the column `selectedCoachId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the `Notification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_selectedCoachId_fkey";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "selectedCoachId";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "assignedCoachId" INTEGER;

-- DropTable
DROP TABLE "Notification";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_assignedCoachId_fkey" FOREIGN KEY ("assignedCoachId") REFERENCES "Coach"("id") ON DELETE SET NULL ON UPDATE CASCADE;
