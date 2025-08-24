-- CreateTable
CREATE TABLE "RememberToken" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "secretHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RememberToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RememberToken_userId_idx" ON "RememberToken"("userId");

-- CreateIndex
CREATE INDEX "RememberToken_expiresAt_idx" ON "RememberToken"("expiresAt");

-- CreateIndex
CREATE INDEX "RememberToken_revoked_idx" ON "RememberToken"("revoked");

-- AddForeignKey
ALTER TABLE "RememberToken" ADD CONSTRAINT "RememberToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
