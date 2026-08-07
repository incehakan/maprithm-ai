-- CreateTable
CREATE TABLE "MarketplacePublishRule" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "minStock" INTEGER,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplacePublishRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePublishRule_storeId_key" ON "MarketplacePublishRule"("storeId");

-- AddForeignKey
ALTER TABLE "MarketplacePublishRule" ADD CONSTRAINT "MarketplacePublishRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
