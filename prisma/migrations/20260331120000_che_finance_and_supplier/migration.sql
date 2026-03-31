-- AlterTable
ALTER TABLE "MarketplaceConnection" ADD COLUMN IF NOT EXISTS "cheSupplierId" TEXT;

-- CreateTable
CREATE TABLE "TrendyolFinanceSyncRun" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "startDateMs" BIGINT NOT NULL,
    "endDateMs" BIGINT NOT NULL,
    "transactionType" TEXT,
    "transactionTypes" TEXT,
    "transactionSubType" TEXT,
    "paymentOrderId" TEXT,
    "paymentDate" TEXT,
    "pageFetched" INTEGER NOT NULL DEFAULT 0,
    "pageSize" INTEGER NOT NULL DEFAULT 500,
    "httpStatus" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "totalPages" INTEGER,
    "totalElements" INTEGER,
    "responseSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendyolFinanceSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendyolFinanceLine" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "syncRunId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "transactionDateMs" BIGINT,
    "transactionType" TEXT,
    "orderNumber" TEXT,
    "paymentOrderId" TEXT,
    "barcode" TEXT,
    "debt" DECIMAL(24,6),
    "credit" DECIMAL(24,6),
    "sellerRevenue" DECIMAL(24,6),
    "commissionAmount" DECIMAL(24,6),
    "description" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendyolFinanceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrendyolFinanceSyncRun_storeId_kind_createdAt_idx" ON "TrendyolFinanceSyncRun"("storeId", "kind", "createdAt");

CREATE INDEX "TrendyolFinanceSyncRun_storeId_createdAt_idx" ON "TrendyolFinanceSyncRun"("storeId", "createdAt");

CREATE UNIQUE INDEX "TrendyolFinanceLine_storeId_kind_externalId_key" ON "TrendyolFinanceLine"("storeId", "kind", "externalId");

CREATE INDEX "TrendyolFinanceLine_storeId_kind_transactionDateMs_idx" ON "TrendyolFinanceLine"("storeId", "kind", "transactionDateMs");

CREATE INDEX "TrendyolFinanceLine_storeId_orderNumber_idx" ON "TrendyolFinanceLine"("storeId", "orderNumber");

ALTER TABLE "TrendyolFinanceSyncRun" ADD CONSTRAINT "TrendyolFinanceSyncRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrendyolFinanceSyncRun" ADD CONSTRAINT "TrendyolFinanceSyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrendyolFinanceLine" ADD CONSTRAINT "TrendyolFinanceLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrendyolFinanceLine" ADD CONSTRAINT "TrendyolFinanceLine_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "TrendyolFinanceSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
