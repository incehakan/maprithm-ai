-- Prisma userSettings.upsert({ where: { storeId } }) requires a UNIQUE constraint on "storeId".
-- Error 42P10: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- happens when this index is missing (e.g. partial deploy or failed phase-2 migration).

-- Aynı mağaza için birden fazla satır varsa tek satır bırak (en güncel updatedAt).
DELETE FROM "UserSettings" us
WHERE us."id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "storeId"
        ORDER BY "updatedAt" DESC NULLS LAST, "id" DESC
      ) AS rn
    FROM "UserSettings"
    WHERE "storeId" IS NOT NULL
  ) t
  WHERE rn > 1
);

DROP INDEX IF EXISTS "UserSettings_userId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "UserSettings_storeId_key"
  ON "UserSettings"("storeId");

CREATE INDEX IF NOT EXISTS "UserSettings_userId_storeId_idx"
  ON "UserSettings"("userId", "storeId");
