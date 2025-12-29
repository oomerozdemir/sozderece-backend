-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "validPackages" TEXT[] DEFAULT ARRAY[]::TEXT[];
