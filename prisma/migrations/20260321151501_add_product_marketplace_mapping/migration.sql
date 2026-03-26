-- CreateTable
CREATE TABLE "ProductMarketplaceMapping" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "trendyolBrandId" INTEGER,
    "trendyolCategoryId" INTEGER,
    "barcode" TEXT,
    "stockCode" TEXT,
    "productMainId" TEXT,
    "cargoCompanyId" INTEGER,
    "dimensionalWeight" DOUBLE PRECISION,
    "currencyType" TEXT NOT NULL DEFAULT 'TRY',
    "vatRate" DOUBLE PRECISION,
    "listPrice" DOUBLE PRECISION,
    "salePrice" DOUBLE PRECISION,
    "quantity" INTEGER,
    "publishStatus" TEXT NOT NULL DEFAULT 'draft',
    "batchRequestId" TEXT,
    "lastErrorMessage" TEXT,
    "mainImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMarketplaceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMarketplaceAttribute" (
    "id" UUID NOT NULL,
    "mappingId" UUID NOT NULL,
    "attributeId" INTEGER NOT NULL,
    "attributeName" TEXT NOT NULL,
    "attributeValueId" INTEGER,
    "customValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMarketplaceAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMarketplaceMapping_productId_platform_key" ON "ProductMarketplaceMapping"("productId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMarketplaceAttribute_mappingId_attributeId_key" ON "ProductMarketplaceAttribute"("mappingId", "attributeId");

-- AddForeignKey
ALTER TABLE "ProductMarketplaceMapping" ADD CONSTRAINT "ProductMarketplaceMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMarketplaceMapping" ADD CONSTRAINT "ProductMarketplaceMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMarketplaceAttribute" ADD CONSTRAINT "ProductMarketplaceAttribute_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "ProductMarketplaceMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
