/*
  Warnings:

  - A unique constraint covering the columns `[merchantOid]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Order_merchantOid_key" ON "Order"("merchantOid");
