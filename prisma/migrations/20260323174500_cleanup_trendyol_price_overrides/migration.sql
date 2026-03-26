-- Mapping fiyat kalıntılarını temizle:
-- 1) Ana fiyat kullanılacak kayıtlarda mapping.salePrice'ı temizle
UPDATE "ProductMarketplaceMapping" m
SET "salePrice" = NULL
FROM "Product" p
WHERE m."productId" = p."id"
  AND m."useProductPrice" = true
  AND m."salePrice" IS NOT NULL
  AND m."salePrice" <> CAST(p."price" AS DOUBLE PRECISION);

-- 2) Geçersiz liste fiyatlarını temizle
UPDATE "ProductMarketplaceMapping" m
SET "listPrice" = NULL
FROM "Product" p
WHERE m."productId" = p."id"
  AND m."listPrice" IS NOT NULL
  AND m."listPrice" < CAST(p."price" AS DOUBLE PRECISION);
