-- Faz-7: Kargo sağlayıcı referansı, paket kargo operasyon alanları, shipping event
CREATE TABLE "MarketplaceCarrierReference" (
    "id" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "providerCode" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "region" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rawData" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceCarrierReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceCarrierReference_platform_providerCode_key" ON "MarketplaceCarrierReference"("platform", "providerCode");
CREATE INDEX "MarketplaceCarrierReference_platform_isActive_idx" ON "MarketplaceCarrierReference"("platform", "isActive");

ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "cargoSenderNumber" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "cargoLabelUrl" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "cargoLabelRawData" JSONB;
ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "trackingUpdatedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "cargoProviderChangedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "labelFetchedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "shippingOperationStatus" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "shippingOperationLastErrorMessage" TEXT;

CREATE TABLE "MarketplaceOrderShippingEvent" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "shipmentPackageId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceOrderShippingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceOrderShippingEvent_storeId_orderId_idx" ON "MarketplaceOrderShippingEvent"("storeId", "orderId");
CREATE INDEX "MarketplaceOrderShippingEvent_storeId_shipmentPackageId_idx" ON "MarketplaceOrderShippingEvent"("storeId", "shipmentPackageId");
CREATE INDEX "MarketplaceOrderShippingEvent_storeId_createdAt_idx" ON "MarketplaceOrderShippingEvent"("storeId", "createdAt");

ALTER TABLE "MarketplaceOrderShippingEvent" ADD CONSTRAINT "MarketplaceOrderShippingEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrderShippingEvent" ADD CONSTRAINT "MarketplaceOrderShippingEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
