-- CreateEnum
CREATE TYPE "ProductMappingApprovalState" AS ENUM ('UNAPPROVED', 'APPROVED');

-- AlterTable
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN "approvalState" "ProductMappingApprovalState" NOT NULL DEFAULT 'UNAPPROVED';
ALTER TABLE "ProductMarketplaceMapping" ADD COLUMN "trendyolContentId" INTEGER;
