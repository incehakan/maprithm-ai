-- Faz-5: arka plan sipariş senkronu, job izleme ve mağaza sync state

CREATE TABLE "OrderSyncJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastCursorStartDate" TIMESTAMP(3),
    "lastCursorEndDate" TIMESTAMP(3),
    "packagesFetchedCount" INTEGER NOT NULL DEFAULT 0,
    "packagesCreatedCount" INTEGER NOT NULL DEFAULT 0,
    "packagesUpdatedCount" INTEGER NOT NULL DEFAULT 0,
    "packagesSkippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" TIMESTAMP(3),
    "options" JSONB,
    "triggeredByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreOrderSyncState" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastAttemptedSyncAt" TIMESTAMP(3),
    "lastWebhookSeenAt" TIMESTAMP(3),
    "lastReconcileAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastErrorMessage" TEXT,
    "lastJobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreOrderSyncState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderSyncJob_storeId_platform_status_createdAt_idx" ON "OrderSyncJob"("storeId", "platform", "status", "createdAt");
CREATE INDEX "OrderSyncJob_storeId_createdAt_idx" ON "OrderSyncJob"("storeId", "createdAt");

CREATE UNIQUE INDEX "StoreOrderSyncState_storeId_platform_key" ON "StoreOrderSyncState"("storeId", "platform");

ALTER TABLE "OrderSyncJob" ADD CONSTRAINT "OrderSyncJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreOrderSyncState" ADD CONSTRAINT "StoreOrderSyncState_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
