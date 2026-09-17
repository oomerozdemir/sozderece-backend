CREATE TABLE "WorkshopWaitlist" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "source" TEXT NOT NULL DEFAULT '14-gunde-calisma-aliskanligi-kazan',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopWaitlist_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkshopWaitlist_source_createdAt_idx" ON "WorkshopWaitlist"("source", "createdAt");
