-- AlterTable
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN IF NOT EXISTS "lastPublishStatus" TEXT;
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN IF NOT EXISTS "lastPublishErrorCode" TEXT;
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN IF NOT EXISTS "lastPublishErrorMessage" TEXT;
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN IF NOT EXISTS "lastPublishAttemptAt" TIMESTAMP(3);
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN IF NOT EXISTS "lastSuccessfulPublishAt" TIMESTAMP(3);
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN IF NOT EXISTS "lastPublishBatchId" TEXT;
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN IF NOT EXISTS "lastPublishPayloadHash" TEXT;
