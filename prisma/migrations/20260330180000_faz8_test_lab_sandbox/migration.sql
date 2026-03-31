-- Faz-8: Operation Test Lab (sandbox/test records ayrımı)

ALTER TABLE "OrderSyncJob" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderSyncJob" ADD COLUMN IF NOT EXISTS "testSource" TEXT;
ALTER TABLE "OrderSyncJob" ADD COLUMN IF NOT EXISTS "sandboxMode" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "testSource" TEXT;
ALTER TABLE "MarketplaceOrder" ADD COLUMN IF NOT EXISTS "sandboxMode" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MarketplaceOrderTrackingEvent" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketplaceOrderTrackingEvent" ADD COLUMN IF NOT EXISTS "testSource" TEXT;

ALTER TABLE "MarketplaceOrderInvoice" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketplaceOrderInvoice" ADD COLUMN IF NOT EXISTS "testSource" TEXT;

ALTER TABLE "MarketplaceOrderLine" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketplaceOrderLine" ADD COLUMN IF NOT EXISTS "testSource" TEXT;

ALTER TABLE "MarketplaceOrderEvent" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketplaceOrderEvent" ADD COLUMN IF NOT EXISTS "testSource" TEXT;

ALTER TABLE "MarketplaceOrderShippingEvent" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketplaceOrderShippingEvent" ADD COLUMN IF NOT EXISTS "testSource" TEXT;

ALTER TABLE "MarketplaceReturnClaim" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketplaceReturnClaim" ADD COLUMN IF NOT EXISTS "testSource" TEXT;
ALTER TABLE "MarketplaceReturnClaim" ADD COLUMN IF NOT EXISTS "sandboxMode" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MarketplaceReturnClaimLine" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketplaceReturnClaimLine" ADD COLUMN IF NOT EXISTS "testSource" TEXT;

ALTER TABLE "MarketplaceReturnClaimEvent" ADD COLUMN IF NOT EXISTS "isTestRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketplaceReturnClaimEvent" ADD COLUMN IF NOT EXISTS "testSource" TEXT;

