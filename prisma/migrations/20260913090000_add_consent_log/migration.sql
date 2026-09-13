-- Çerez banner'ı karar kaydı (KVKK denetlenebilirliği için).
CREATE TABLE "ConsentLog" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "necessary" BOOLEAN NOT NULL DEFAULT true,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentLog_createdAt_idx" ON "ConsentLog"("createdAt");
