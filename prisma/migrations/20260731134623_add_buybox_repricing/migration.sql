-- AlterTable
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN     "autoRepriceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repriceMinPrice" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "BuyboxRepricingSettings" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "strategy" TEXT NOT NULL DEFAULT 'undercut_amount',
    "undercutValue" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "minMarginPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyboxRepricingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuyboxRepricingSettings_storeId_key" ON "BuyboxRepricingSettings"("storeId");

-- AddForeignKey
ALTER TABLE "BuyboxRepricingSettings" ADD CONSTRAINT "BuyboxRepricingSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
