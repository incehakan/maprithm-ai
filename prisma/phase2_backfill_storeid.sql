-- Backfill any missing storeId values using user's earliest membership.
-- Safe for phase-2 because it only updates NULL storeId rows.

UPDATE "ActivityLog" al
SET
  "storeId" = uds."storeId",
  "membershipId" = COALESCE(al."membershipId", uds."membershipId")
FROM (
  SELECT DISTINCT ON (sm."userId")
    sm."userId",
    sm."storeId",
    sm."id" AS "membershipId"
  FROM "StoreMembership" sm
  ORDER BY sm."userId", sm."createdAt" ASC
) uds
WHERE al."storeId" IS NULL
  AND al."userId" = uds."userId";

UPDATE "Product" p
SET "storeId" = uds."storeId"
FROM (
  SELECT DISTINCT ON (sm."userId")
    sm."userId",
    sm."storeId"
  FROM "StoreMembership" sm
  ORDER BY sm."userId", sm."createdAt" ASC
) uds
WHERE p."storeId" IS NULL
  AND p."userId" = uds."userId";

UPDATE "ImportJob" ij
SET "storeId" = uds."storeId"
FROM (
  SELECT DISTINCT ON (sm."userId")
    sm."userId",
    sm."storeId"
  FROM "StoreMembership" sm
  ORDER BY sm."userId", sm."createdAt" ASC
) uds
WHERE ij."storeId" IS NULL
  AND ij."userId" = uds."userId";

UPDATE "XmlFeedSource" x
SET "storeId" = uds."storeId"
FROM (
  SELECT DISTINCT ON (sm."userId")
    sm."userId",
    sm."storeId"
  FROM "StoreMembership" sm
  ORDER BY sm."userId", sm."createdAt" ASC
) uds
WHERE x."storeId" IS NULL
  AND x."userId" = uds."userId";

UPDATE "MarketplaceConnection" mc
SET "storeId" = uds."storeId"
FROM (
  SELECT DISTINCT ON (sm."userId")
    sm."userId",
    sm."storeId"
  FROM "StoreMembership" sm
  ORDER BY sm."userId", sm."createdAt" ASC
) uds
WHERE mc."storeId" IS NULL
  AND mc."userId" = uds."userId";

UPDATE "TrendyolPublishJob" tj
SET "storeId" = uds."storeId"
FROM (
  SELECT DISTINCT ON (sm."userId")
    sm."userId",
    sm."storeId"
  FROM "StoreMembership" sm
  ORDER BY sm."userId", sm."createdAt" ASC
) uds
WHERE tj."storeId" IS NULL
  AND tj."userId" = uds."userId";

UPDATE "ProductMarketplaceMapping" m
SET "storeId" = p."storeId"
FROM "Product" p
WHERE m."storeId" IS NULL
  AND m."productId" = p."id";

UPDATE "UserSettings" us
SET "storeId" = uds."storeId"
FROM (
  SELECT DISTINCT ON (sm."userId")
    sm."userId",
    sm."storeId"
  FROM "StoreMembership" sm
  ORDER BY sm."userId", sm."createdAt" ASC
) uds
WHERE us."storeId" IS NULL
  AND us."userId" = uds."userId";

