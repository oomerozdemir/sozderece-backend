-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "referrer" TEXT,
    "referrerDomain" TEXT,
    "landingPage" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "channel" TEXT,
    "deviceType" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "userAgent" TEXT,
    "pageViewCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VisitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_userId_idx" ON "Visitor"("userId");

-- CreateIndex
CREATE INDEX "Visitor_lastSeenAt_idx" ON "Visitor"("lastSeenAt");

-- CreateIndex
CREATE INDEX "VisitorSession_visitorId_startedAt_idx" ON "VisitorSession"("visitorId", "startedAt");

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorSession" ADD CONSTRAINT "VisitorSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Order
ALTER TABLE "Order" ADD COLUMN "visitorId" TEXT;
ALTER TABLE "Order" ADD COLUMN "visitorSessionId" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_visitorSessionId_fkey" FOREIGN KEY ("visitorSessionId") REFERENCES "VisitorSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: PaymentMeta
ALTER TABLE "PaymentMeta" ADD COLUMN "visitorId" TEXT;
ALTER TABLE "PaymentMeta" ADD COLUMN "visitorSessionId" TEXT;
ALTER TABLE "PaymentMeta" ADD CONSTRAINT "PaymentMeta_visitorSessionId_fkey" FOREIGN KEY ("visitorSessionId") REFERENCES "VisitorSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Subscription
ALTER TABLE "Subscription" ADD COLUMN "visitorId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "visitorSessionId" TEXT;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_visitorSessionId_fkey" FOREIGN KEY ("visitorSessionId") REFERENCES "VisitorSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
