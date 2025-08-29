-- CreateEnum
CREATE TYPE "LessonMode" AS ENUM ('ONLINE', 'FACE_TO_FACE', 'BOTH');

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "subjects" TEXT[],
    "grades" TEXT[],
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "mode" "LessonMode" NOT NULL DEFAULT 'BOTH',
    "priceOnline" INTEGER,
    "priceF2F" INTEGER,
    "bio" TEXT,
    "photoUrl" TEXT,
    "slug" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_userId_key" ON "TeacherProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_slug_key" ON "TeacherProfile"("slug");

-- CreateIndex
CREATE INDEX "TeacherProfile_city_idx" ON "TeacherProfile"("city");

-- CreateIndex
CREATE INDEX "TeacherProfile_district_idx" ON "TeacherProfile"("district");

-- CreateIndex
CREATE INDEX "TeacherProfile_mode_idx" ON "TeacherProfile"("mode");

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
