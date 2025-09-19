-- CreateTable
CREATE TABLE "StudentPackageRight" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "packageSlug" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "rightsTotal" INTEGER NOT NULL,
    "rightsUsed" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentPackageRight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentPackageRight_studentId_packageSlug_period_key" ON "StudentPackageRight"("studentId", "packageSlug", "period");
