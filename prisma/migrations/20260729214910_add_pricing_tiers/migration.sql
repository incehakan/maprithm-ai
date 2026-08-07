-- CreateTable
CREATE TABLE "PricingTier" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "label" TEXT,
    "minCostPrice" DOUBLE PRECISION NOT NULL,
    "maxCostPrice" DOUBLE PRECISION,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "cargoCost" DOUBLE PRECISION NOT NULL,
    "targetProfitRate" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingTier_storeId_isActive_minCostPrice_idx" ON "PricingTier"("storeId", "isActive", "minCostPrice");

-- AddForeignKey
ALTER TABLE "PricingTier" ADD CONSTRAINT "PricingTier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
