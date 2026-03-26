-- CreateTable
CREATE TABLE "UserSettings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "companyName" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'TRY',
    "defaultVatRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "defaultCommissionRate" DOUBLE PRECISION,
    "defaultCargoCost" DOUBLE PRECISION,
    "defaultTargetProfitRate" DOUBLE PRECISION,
    "defaultDesi" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fallbackBrand" TEXT,
    "fallbackCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
