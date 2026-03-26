ALTER TABLE "ProductMarketplaceMapping"
  ADD COLUMN "useProductPrice" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "useProductStock" BOOLEAN NOT NULL DEFAULT true;

UPDATE "ProductMarketplaceMapping"
SET
  "useProductPrice" = true,
  "useProductStock" = true
WHERE
  "useProductPrice" IS DISTINCT FROM true
  OR "useProductStock" IS DISTINCT FROM true;
