-- AlterTable
ALTER TABLE "TrendyolBrand" ADD COLUMN     "isActive" BOOLEAN,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "rawData" JSONB;

-- AlterTable
ALTER TABLE "TrendyolCategory" ADD COLUMN     "isActive" BOOLEAN,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "rawData" JSONB;
