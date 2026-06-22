-- AlterTable
ALTER TABLE "Product" ADD COLUMN "origin" TEXT;

-- CreateTable
CREATE TABLE "TrendyolOriginCountry" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendyolOriginCountry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrendyolOriginCountry_code_key" ON "TrendyolOriginCountry"("code");
