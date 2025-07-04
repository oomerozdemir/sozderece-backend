/*
  Warnings:

  - Made the column `billingInfoId` on table `Order` required. This step will fail if there are existing NULL values in that column.
  - Made the column `endDate` on table `Order` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updatedAt` on table `Order` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_billingInfoId_fkey";

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "billingInfoId" SET NOT NULL,
ALTER COLUMN "endDate" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_billingInfoId_fkey" FOREIGN KEY ("billingInfoId") REFERENCES "BillingInfo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
