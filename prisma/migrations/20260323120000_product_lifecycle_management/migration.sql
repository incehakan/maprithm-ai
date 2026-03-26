ALTER TABLE "Product"
  ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "unpublishedAt" TIMESTAMP(3);

ALTER TABLE "ProductMarketplaceMapping"
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "unpublishedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncAt" TIMESTAMP(3);

UPDATE "Product"
SET "lifecycleStatus" = CASE
  WHEN "status" = 'active' THEN 'published'
  WHEN "status" = 'passive' THEN 'unpublished'
  WHEN "status" = 'draft' THEN 'draft'
  ELSE 'draft'
END
WHERE "lifecycleStatus" = 'draft';

UPDATE "ProductMarketplaceMapping"
SET "publishStatus" = CASE
  WHEN LOWER("publishStatus") IN ('draft','ready','sent','processing','published','failed','unpublished','archived')
    THEN LOWER("publishStatus")
  ELSE 'draft'
END;

CREATE INDEX "Product_userId_lifecycleStatus_idx"
  ON "Product"("userId", "lifecycleStatus");

CREATE INDEX "Product_userId_archivedAt_idx"
  ON "Product"("userId", "archivedAt");

CREATE INDEX "ProductMarketplaceMapping_userId_platform_publishStatus_idx"
  ON "ProductMarketplaceMapping"("userId", "platform", "publishStatus");
