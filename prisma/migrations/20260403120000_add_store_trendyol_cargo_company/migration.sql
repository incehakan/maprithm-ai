-- CreateTable
CREATE TABLE "StoreTrendyolCargoCompany" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "cargoCompanyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rawData" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreTrendyolCargoCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreTrendyolCargoCompany_storeId_platform_isActive_idx" ON "StoreTrendyolCargoCompany"("storeId", "platform", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StoreTrendyolCargoCompany_storeId_platform_cargoCompanyId_key" ON "StoreTrendyolCargoCompany"("storeId", "platform", "cargoCompanyId");

-- AddForeignKey
ALTER TABLE "StoreTrendyolCargoCompany" ADD CONSTRAINT "StoreTrendyolCargoCompany_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
