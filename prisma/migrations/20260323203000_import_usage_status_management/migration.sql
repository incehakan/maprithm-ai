ALTER TABLE "ImportJob"
  ADD COLUMN "usageStatus" TEXT NOT NULL DEFAULT 'active';

UPDATE "ImportJob"
SET "usageStatus" = 'active'
WHERE "usageStatus" IS DISTINCT FROM 'active';

CREATE INDEX "ImportJob_userId_usageStatus_createdAt_idx"
ON "ImportJob"("userId", "usageStatus", "createdAt");
