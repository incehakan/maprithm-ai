ALTER TABLE "ImportRow"
  ADD COLUMN "mainImageUrl" TEXT,
  ADD COLUMN "imageUrls" JSONB;

ALTER TABLE "Product"
  ADD COLUMN "mainImageUrl" TEXT,
  ADD COLUMN "imageUrls" JSONB;

ALTER TABLE "ProductMarketplaceMapping"
  ADD COLUMN "imageUrls" JSONB;
