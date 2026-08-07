-- Drop legacy Trendyol reference tables superseded by Marketplace* EAV models.
-- These tables are no longer in schema.prisma and have zero active Prisma/raw-SQL usage in src/.
-- StoreTrendyolCargoCompany was superseded by MarketplaceCarrier.

DROP TABLE IF EXISTS "TrendyolCategoryAttributeValue";
DROP TABLE IF EXISTS "TrendyolCategoryAttribute";
DROP TABLE IF EXISTS "TrendyolBrand";
DROP TABLE IF EXISTS "TrendyolCategory";
DROP TABLE IF EXISTS "StoreTrendyolCargoCompany";
