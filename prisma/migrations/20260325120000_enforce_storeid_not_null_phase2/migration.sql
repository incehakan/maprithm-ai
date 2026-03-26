/*
  Phase-2: Enforce storeId NOT NULL (DB-level) with prechecks.
  If any store-scoped table has NULL storeId, migration aborts with a clear error.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "StoreMembership" LIMIT 1) IS NOT TRUE THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: StoreMembership table is empty. Run seed/backfill first.';
  END IF;

  IF EXISTS (SELECT 1 FROM "ActivityLog" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: ActivityLog.storeId has NULL rows. Run prisma/phase2_backfill_storeid.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "Product" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: Product.storeId has NULL rows. Run prisma/phase2_backfill_storeid.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "ProductMarketplaceMapping" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: ProductMarketplaceMapping.storeId has NULL rows. Run prisma/phase2_backfill_storeid.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "ImportJob" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: ImportJob.storeId has NULL rows. Run prisma/phase2_backfill_storeid.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "XmlFeedSource" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: XmlFeedSource.storeId has NULL rows. Run prisma/phase2_backfill_storeid.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "MarketplaceConnection" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: MarketplaceConnection.storeId has NULL rows. Run prisma/phase2_backfill_storeid.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "TrendyolPublishJob" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: TrendyolPublishJob.storeId has NULL rows. Run prisma/phase2_backfill_storeid.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "UserSettings" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: UserSettings.storeId has NULL rows. Run prisma/phase2_backfill_storeid.sql';
  END IF;
END $$;

-- Add storeId to ProductMarketplaceAttribute (backfill from mapping)
ALTER TABLE "ProductMarketplaceAttribute" ADD COLUMN IF NOT EXISTS "storeId" UUID;
UPDATE "ProductMarketplaceAttribute" a
SET "storeId" = m."storeId"
FROM "ProductMarketplaceMapping" m
WHERE a."storeId" IS NULL
  AND a."mappingId" = m."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ProductMarketplaceAttribute" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Phase-2 precheck failed: ProductMarketplaceAttribute.storeId backfill incomplete.';
  END IF;
END $$;

-- NOT NULL enforcement
ALTER TABLE "ActivityLog" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ProductMarketplaceMapping" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ImportJob" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "XmlFeedSource" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "MarketplaceConnection" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "TrendyolPublishJob" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "UserSettings" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ProductMarketplaceAttribute" ALTER COLUMN "storeId" SET NOT NULL;

-- Update unique constraints to be store-scoped
DROP INDEX IF EXISTS "MarketplaceConnection_userId_platform_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceConnection_storeId_platform_key"
  ON "MarketplaceConnection"("storeId", "platform");
CREATE INDEX IF NOT EXISTS "MarketplaceConnection_userId_platform_idx"
  ON "MarketplaceConnection"("userId", "platform");

DROP INDEX IF EXISTS "TrendyolPublishJob_userId_batchRequestId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "TrendyolPublishJob_storeId_batchRequestId_key"
  ON "TrendyolPublishJob"("storeId", "batchRequestId");

DROP INDEX IF EXISTS "UserSettings_userId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "UserSettings_storeId_key"
  ON "UserSettings"("storeId");
CREATE INDEX IF NOT EXISTS "UserSettings_userId_storeId_idx"
  ON "UserSettings"("userId", "storeId");

-- FK for ProductMarketplaceAttribute.storeId
ALTER TABLE "ProductMarketplaceAttribute"
  ADD CONSTRAINT "ProductMarketplaceAttribute_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ProductMarketplaceAttribute_storeId_mappingId_idx"
  ON "ProductMarketplaceAttribute"("storeId", "mappingId");

