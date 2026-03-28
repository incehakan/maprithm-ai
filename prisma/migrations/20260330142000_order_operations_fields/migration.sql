-- AlterTable
ALTER TABLE "MarketplaceOrder"
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "deliveryAddressType" TEXT,
  ADD COLUMN "invoiceLink" TEXT,
  ADD COLUMN "invoiceNumber" TEXT,
  ADD COLUMN "invoiceDateTime" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MarketplaceOrderLine"
  ADD COLUMN "lineStatus" TEXT;

