-- AlterTable
ALTER TABLE "Product" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "Product" ADD COLUMN "priceHash" TEXT;
ALTER TABLE "Product" ADD COLUMN "stockHash" TEXT;

-- AlterTable
ALTER TABLE "XmlFeedSource" ADD COLUMN "lastSyncSkippedCount" INTEGER;
ALTER TABLE "XmlFeedSource" ADD COLUMN "lastSyncPublishedCount" INTEGER;
ALTER TABLE "XmlFeedSource" ADD COLUMN "lastSyncInventoryPushCount" INTEGER;
