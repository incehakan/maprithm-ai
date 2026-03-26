-- CreateTable
CREATE TABLE "TrendyolBrand" (
    "id" UUID NOT NULL,
    "brandId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendyolBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendyolCategory" (
    "id" UUID NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "parentCategoryId" INTEGER,
    "isLeaf" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendyolCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrendyolBrand_brandId_key" ON "TrendyolBrand"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "TrendyolCategory_categoryId_key" ON "TrendyolCategory"("categoryId");
