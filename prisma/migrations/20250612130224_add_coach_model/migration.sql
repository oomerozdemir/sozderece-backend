/*
  Warnings:

  - You are about to drop the column `coachId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Appointment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_coachId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_studentId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_coachId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "coachId";

-- DropTable
DROP TABLE "Appointment";
