-- CreateTable
CREATE TABLE "ImportRowMarketplaceSuggestion" (
    "id" UUID NOT NULL,
    "importRowId" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'trendyol',
    "suggestedBrandId" INTEGER,
    "suggestedBrandName" TEXT,
    "suggestedCategoryId" INTEGER,
    "suggestedCategoryName" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "aiReasoningSummary" TEXT,
    "missingRequiredAttributes" JSONB,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRowMarketplaceSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRowMarketplaceSuggestedAttribute" (
    "id" UUID NOT NULL,
    "suggestionId" UUID NOT NULL,
    "attributeId" INTEGER NOT NULL,
    "attributeName" TEXT NOT NULL,
    "attributeValueId" INTEGER,
    "attributeValue" TEXT,
    "customValue" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRowMarketplaceSuggestedAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportRowMarketplaceSuggestion_importRowId_platform_key" ON "ImportRowMarketplaceSuggestion"("importRowId", "platform");

-- CreateIndex
CREATE INDEX "ImportRowMarketplaceSuggestion_importRowId_idx" ON "ImportRowMarketplaceSuggestion"("importRowId");

-- CreateIndex
CREATE INDEX "ImportRowMarketplaceSuggestedAttribute_suggestionId_attributeId_idx" ON "ImportRowMarketplaceSuggestedAttribute"("suggestionId", "attributeId");

-- AddForeignKey
ALTER TABLE "ImportRowMarketplaceSuggestion" ADD CONSTRAINT "ImportRowMarketplaceSuggestion_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "ImportRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowMarketplaceSuggestedAttribute" ADD CONSTRAINT "ImportRowMarketplaceSuggestedAttribute_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "ImportRowMarketplaceSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
