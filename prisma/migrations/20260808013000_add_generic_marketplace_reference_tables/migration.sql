-- Generic marketplace reference tables (EAV-style brands/categories/attributes/carriers).
-- These models existed in schema.prisma but were never included in a prior migration,
-- which caused "table public.MarketplaceBrand does not exist" while migrate status was up to date.

-- CreateTable
CREATE TABLE "MarketplaceBrand" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceCategory" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceAttribute" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'string',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceAttributeValue" (
    "id" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceCarrier" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TRENDYOL',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceCarrier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceBrand_storeId_platform_externalId_key" ON "MarketplaceBrand"("storeId", "platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceCategory_storeId_platform_externalId_key" ON "MarketplaceCategory"("storeId", "platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceAttribute_storeId_platform_categoryId_externalId_key" ON "MarketplaceAttribute"("storeId", "platform", "categoryId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceAttributeValue_attributeId_externalId_key" ON "MarketplaceAttributeValue"("attributeId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceCarrier_storeId_platform_code_key" ON "MarketplaceCarrier"("storeId", "platform", "code");

-- CreateIndex
CREATE INDEX "MarketplaceCarrier_storeId_platform_isActive_idx" ON "MarketplaceCarrier"("storeId", "platform", "isActive");

-- AddForeignKey
ALTER TABLE "MarketplaceBrand" ADD CONSTRAINT "MarketplaceBrand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceCategory" ADD CONSTRAINT "MarketplaceCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceAttribute" ADD CONSTRAINT "MarketplaceAttribute_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceAttributeValue" ADD CONSTRAINT "MarketplaceAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "MarketplaceAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceCarrier" ADD CONSTRAINT "MarketplaceCarrier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
