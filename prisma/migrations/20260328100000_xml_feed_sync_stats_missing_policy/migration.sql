-- AlterTable
ALTER TABLE "XmlFeedSource" ADD COLUMN "lastSyncProductsUpdated" INTEGER;
ALTER TABLE "XmlFeedSource" ADD COLUMN "deactivateMissingFromFeed" BOOLEAN NOT NULL DEFAULT false;
