-- Faz-2: shipment package lifecycle, split relations, richer order events

ALTER TABLE "MarketplaceOrder" ADD COLUMN "rootOrderNumber" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "parentShipmentPackageId" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "packageStatusUpdatedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN "splitFromPackageId" UUID;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "splitDetectedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN "isSplitPackage" BOOLEAN NOT NULL DEFAULT false;

UPDATE "MarketplaceOrder" SET "rootOrderNumber" = "orderNumber" WHERE "rootOrderNumber" IS NULL;

ALTER TABLE "MarketplaceOrder" ALTER COLUMN "rootOrderNumber" SET NOT NULL;

ALTER TABLE "MarketplaceOrder"
ADD CONSTRAINT "MarketplaceOrder_splitFromPackageId_fkey"
FOREIGN KEY ("splitFromPackageId") REFERENCES "MarketplaceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MarketplaceOrder_storeId_rootOrderNumber_idx" ON "MarketplaceOrder"("storeId", "rootOrderNumber");

ALTER TABLE "MarketplaceOrderEvent" ADD COLUMN "previousStatus" TEXT;
ALTER TABLE "MarketplaceOrderEvent" ADD COLUMN "nextStatus" TEXT;
ALTER TABLE "MarketplaceOrderEvent" ADD COLUMN "relatedShipmentPackageId" TEXT;

CREATE INDEX "MarketplaceOrderEvent_storeId_relatedShipmentPackageId_idx" ON "MarketplaceOrderEvent"("storeId", "relatedShipmentPackageId");
