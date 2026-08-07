-- AlterTable
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN     "buyboxCheckedAt" TIMESTAMP(3),
ADD COLUMN     "buyboxOrder" INTEGER,
ADD COLUMN     "buyboxPrice" DOUBLE PRECISION,
ADD COLUMN     "hasMultipleSeller" BOOLEAN,
ADD COLUMN     "secondBuyboxPrice" DOUBLE PRECISION,
ADD COLUMN     "thirdBuyboxPrice" DOUBLE PRECISION;
