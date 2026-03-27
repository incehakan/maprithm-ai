-- CreateTable
CREATE TABLE "SystemMarketplaceConnection" (
    "id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "apiSecretEncrypted" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemMarketplaceConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemMarketplaceConnection_platform_key" ON "SystemMarketplaceConnection"("platform");

-- AlterTable
ALTER TABLE "TrendyolBrand" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "TrendyolCategory" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "TrendyolCategoryAttribute" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "TrendyolCategoryAttributeValue" ADD COLUMN "removedAt" TIMESTAMP(3);
