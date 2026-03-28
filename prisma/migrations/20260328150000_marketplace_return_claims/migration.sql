CREATE TABLE "MarketplaceReturnClaim" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "claimId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "shipmentPackageId" TEXT,
    "claimDate" TIMESTAMP(3) NOT NULL,
    "claimStatus" TEXT NOT NULL,
    "returnReasonId" TEXT,
    "returnReasonText" TEXT,
    "cargoTrackingNumber" TEXT,
    "cargoProviderName" TEXT,
    "customerFirstName" TEXT,
    "customerLastName" TEXT,
    "totalPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "rejectedPackageInfo" JSONB,
    "replacementOutboundPackageInfo" JSONB,
    "rawData" JSONB,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceReturnClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceReturnClaimLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "claimIdRef" UUID NOT NULL,
    "lineId" TEXT,
    "barcode" TEXT,
    "stockCode" TEXT,
    "productName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lineUnitPrice" DOUBLE PRECISION,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceReturnClaimLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceReturnClaimEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "claimRecordId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "previousStatus" TEXT,
    "nextStatus" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceReturnClaimEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrendyolReturnReason" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'claim_issue',
    "rawData" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendyolReturnReason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceReturnClaim_storeId_platform_claimId_key" ON "MarketplaceReturnClaim"("storeId", "platform", "claimId");
CREATE INDEX "MarketplaceReturnClaim_storeId_claimStatus_idx" ON "MarketplaceReturnClaim"("storeId", "claimStatus");
CREATE INDEX "MarketplaceReturnClaim_storeId_orderNumber_idx" ON "MarketplaceReturnClaim"("storeId", "orderNumber");
CREATE INDEX "MarketplaceReturnClaim_storeId_claimDate_idx" ON "MarketplaceReturnClaim"("storeId", "claimDate");

CREATE INDEX "MarketplaceReturnClaimLine_storeId_claimIdRef_idx" ON "MarketplaceReturnClaimLine"("storeId", "claimIdRef");

CREATE INDEX "MarketplaceReturnClaimEvent_storeId_claimRecordId_idx" ON "MarketplaceReturnClaimEvent"("storeId", "claimRecordId");
CREATE INDEX "MarketplaceReturnClaimEvent_storeId_createdAt_idx" ON "MarketplaceReturnClaimEvent"("storeId", "createdAt");

CREATE UNIQUE INDEX "TrendyolReturnReason_storeId_platform_category_code_key" ON "TrendyolReturnReason"("storeId", "platform", "category", "code");
CREATE INDEX "TrendyolReturnReason_storeId_category_idx" ON "TrendyolReturnReason"("storeId", "category");

ALTER TABLE "MarketplaceReturnClaim" ADD CONSTRAINT "MarketplaceReturnClaim_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReturnClaimLine" ADD CONSTRAINT "MarketplaceReturnClaimLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReturnClaimLine" ADD CONSTRAINT "MarketplaceReturnClaimLine_claimIdRef_fkey" FOREIGN KEY ("claimIdRef") REFERENCES "MarketplaceReturnClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReturnClaimEvent" ADD CONSTRAINT "MarketplaceReturnClaimEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReturnClaimEvent" ADD CONSTRAINT "MarketplaceReturnClaimEvent_claimRecordId_fkey" FOREIGN KEY ("claimRecordId") REFERENCES "MarketplaceReturnClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrendyolReturnReason" ADD CONSTRAINT "TrendyolReturnReason_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
