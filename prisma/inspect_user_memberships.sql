SELECT
  u."id"::text AS "userId",
  u."email",
  COUNT(sm.id)::int AS "membershipCount",
  MIN(sm."storeId"::text) AS "minStoreId"
FROM "User" u
LEFT JOIN "StoreMembership" sm
  ON sm."userId" = u."id"
GROUP BY u."id", u."email"
ORDER BY "membershipCount" DESC, u."createdAt" DESC
LIMIT 20;

