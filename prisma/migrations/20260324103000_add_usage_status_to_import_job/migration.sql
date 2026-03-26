ALTER TABLE "ImportJob"
  ADD COLUMN IF NOT EXISTS "usageStatus" TEXT;

UPDATE "ImportJob"
SET "usageStatus" = 'active'
WHERE "usageStatus" IS NULL;

ALTER TABLE "ImportJob"
  ALTER COLUMN "usageStatus" SET DEFAULT 'active';

ALTER TABLE "ImportJob"
  ALTER COLUMN "usageStatus" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "ImportJob_userId_usageStatus_createdAt_idx"
ON "ImportJob"("userId", "usageStatus", "createdAt");
