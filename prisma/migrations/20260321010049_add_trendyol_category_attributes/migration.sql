-- CreateTable
CREATE TABLE "TrendyolCategoryAttribute" (
    "id" UUID NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "attributeId" INTEGER NOT NULL,
    "attributeName" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isVariantable" BOOLEAN NOT NULL DEFAULT false,
    "allowCustom" BOOLEAN NOT NULL DEFAULT false,
    "rawData" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendyolCategoryAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendyolCategoryAttributeValue" (
    "id" UUID NOT NULL,
    "categoryAttributeId" UUID NOT NULL,
    "attributeValueId" INTEGER NOT NULL,
    "attributeValue" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendyolCategoryAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrendyolCategoryAttribute_categoryId_attributeId_key" ON "TrendyolCategoryAttribute"("categoryId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "TrendyolCategoryAttributeValue_categoryAttributeId_attribut_key" ON "TrendyolCategoryAttributeValue"("categoryAttributeId", "attributeValueId");

-- AddForeignKey
ALTER TABLE "TrendyolCategoryAttributeValue" ADD CONSTRAINT "TrendyolCategoryAttributeValue_categoryAttributeId_fkey" FOREIGN KEY ("categoryAttributeId") REFERENCES "TrendyolCategoryAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
