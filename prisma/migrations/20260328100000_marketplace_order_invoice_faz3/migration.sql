-- Faz-3: invoice flow tracking on MarketplaceOrder + audit table

ALTER TABLE "MarketplaceOrder" ADD COLUMN "invoiceSentAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceOrder" ADD COLUMN "invoiceStatus" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "invoiceLastErrorMessage" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN "invoiceRawData" JSONB;

CREATE TABLE "MarketplaceOrderInvoice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "shipmentPackageId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDateTime" TIMESTAMP(3),
    "invoiceLink" TEXT NOT NULL,
    "invoiceStatus" TEXT NOT NULL,
    "lastErrorMessage" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrderInvoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceOrderInvoice_storeId_orderId_idx" ON "MarketplaceOrderInvoice"("storeId", "orderId");
CREATE INDEX "MarketplaceOrderInvoice_storeId_shipmentPackageId_idx" ON "MarketplaceOrderInvoice"("storeId", "shipmentPackageId");

ALTER TABLE "MarketplaceOrderInvoice" ADD CONSTRAINT "MarketplaceOrderInvoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrderInvoice" ADD CONSTRAINT "MarketplaceOrderInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
