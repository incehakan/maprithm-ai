ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "sourceImportJobId" UUID,
  ADD COLUMN IF NOT EXISTS "sourceImportRowId" UUID,
  ADD COLUMN IF NOT EXISTS "createdFromImport" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Product_userId_sourceImportJobId_idx"
ON "Product"("userId", "sourceImportJobId");
