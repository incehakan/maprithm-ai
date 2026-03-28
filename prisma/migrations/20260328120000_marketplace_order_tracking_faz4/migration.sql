-- Faz-4: kargo takip görünürlüğü + tracking event satırları

ALTER TABLE "MarketplaceOrder" ADD COLUMN "cargoTrackingLink" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "cargoProviderCode" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "cargoStatusText" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "cargoLastEventAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN "cargoLastEventMessage" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "trackingRawData" JSONB;

CREATE TABLE "MarketplaceOrderTrackingEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "shipmentPackageId" TEXT NOT NULL,
    "eventCode" TEXT,
    "eventTitle" TEXT NOT NULL,
    "eventDescription" TEXT,
    "eventDateTime" TIMESTAMP(3),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceOrderTrackingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceOrderTrackingEvent_storeId_orderId_idx" ON "MarketplaceOrderTrackingEvent"("storeId", "orderId");
CREATE INDEX "MarketplaceOrderTrackingEvent_storeId_shipmentPackageId_idx" ON "MarketplaceOrderTrackingEvent"("storeId", "shipmentPackageId");

ALTER TABLE "MarketplaceOrderTrackingEvent" ADD CONSTRAINT "MarketplaceOrderTrackingEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrderTrackingEvent" ADD CONSTRAINT "MarketplaceOrderTrackingEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
