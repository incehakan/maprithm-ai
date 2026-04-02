/*
  Repair migration:
  Ensure ProductMarketplaceAttribute.storeId exists and is fully enforced.
  This is needed for environments where an earlier migration was marked as applied
  but the column/FK/index was not actually created.
*/

-- 1) Add column if missing
ALTER TABLE "ProductMarketplaceAttribute"
  ADD COLUMN IF NOT EXISTS "storeId" UUID;

-- 2) Backfill from ProductMarketplaceMapping
UPDATE "ProductMarketplaceAttribute" a
SET "storeId" = m."storeId"
FROM "ProductMarketplaceMapping" m
WHERE a."storeId" IS NULL
  AND a."mappingId" = m."id";

-- 3) Enforce data correctness if any rows exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ProductMarketplaceAttribute"
    WHERE "storeId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Repair failed: ProductMarketplaceAttribute.storeId has NULL rows after backfill.';
  END IF;
END $$;

-- 4) Enforce NOT NULL
ALTER TABLE "ProductMarketplaceAttribute"
  ALTER COLUMN "storeId" SET NOT NULL;

-- 5) Add FK if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ProductMarketplaceAttribute_storeId_fkey'
  ) THEN
    ALTER TABLE "ProductMarketplaceAttribute"
      ADD CONSTRAINT "ProductMarketplaceAttribute_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 6) Add composite index if missing
CREATE INDEX IF NOT EXISTS "ProductMarketplaceAttribute_storeId_mappingId_idx"
  ON "ProductMarketplaceAttribute"("storeId", "mappingId");

