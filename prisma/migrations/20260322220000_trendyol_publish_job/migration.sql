CREATE TABLE "TrendyolPublishJob" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "batchRequestId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "batchStatus" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "batchRequestType" TEXT,
    "lastSyncMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendyolPublishJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrendyolPublishJob_userId_batchRequestId_key" ON "TrendyolPublishJob"("userId", "batchRequestId");

CREATE INDEX "TrendyolPublishJob_userId_updatedAt_idx" ON "TrendyolPublishJob"("userId", "updatedAt");

ALTER TABLE "TrendyolPublishJob" ADD CONSTRAINT "TrendyolPublishJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
