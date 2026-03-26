-- Marketplace orders (Trendyol Faz-1)

CREATE TABLE "MarketplaceOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "orderNumber" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "shipmentPackageId" TEXT NOT NULL,
    "packageStatus" TEXT,
    "cargoTrackingNumber" TEXT,
    "cargoProviderName" TEXT,
    "customerFirstName" TEXT,
    "customerLastName" TEXT,
    "customerEmailMasked" TEXT,
    "customerPhoneMasked" TEXT,
    "totalPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "invoiceAddress" JSONB,
    "shipmentAddress" JSONB,
    "rawData" JSONB,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceOrderLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "lineId" TEXT,
    "barcode" TEXT,
    "stockCode" TEXT,
    "productName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lineUnitPrice" DOUBLE PRECISION,
    "vatBaseAmount" DOUBLE PRECISION,
    "commissionAmount" DOUBLE PRECISION,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceOrderEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "orderId" UUID,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceOrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceOrder_storeId_orderDate_idx" ON "MarketplaceOrder"("storeId", "orderDate");

CREATE INDEX "MarketplaceOrder_storeId_packageStatus_idx" ON "MarketplaceOrder"("storeId", "packageStatus");

CREATE INDEX "MarketplaceOrder_storeId_orderNumber_idx" ON "MarketplaceOrder"("storeId", "orderNumber");

CREATE UNIQUE INDEX "MarketplaceOrder_storeId_platform_shipmentPackageId_key" ON "MarketplaceOrder"("storeId", "platform", "shipmentPackageId");

CREATE INDEX "MarketplaceOrderLine_storeId_orderId_idx" ON "MarketplaceOrderLine"("storeId", "orderId");

CREATE INDEX "MarketplaceOrderEvent_storeId_createdAt_idx" ON "MarketplaceOrderEvent"("storeId", "createdAt");

CREATE INDEX "MarketplaceOrderEvent_orderId_idx" ON "MarketplaceOrderEvent"("orderId");

ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceOrderLine" ADD CONSTRAINT "MarketplaceOrderLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceOrderLine" ADD CONSTRAINT "MarketplaceOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceOrderEvent" ADD CONSTRAINT "MarketplaceOrderEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceOrderEvent" ADD CONSTRAINT "MarketplaceOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
