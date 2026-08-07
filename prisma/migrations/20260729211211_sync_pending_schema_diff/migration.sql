-- DropIndex
DROP INDEX "UserSettings_storeId_idx";

-- AlterTable
ALTER TABLE "MarketplaceOrder" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketplaceOrderEvent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketplaceOrderInvoice" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketplaceOrderLine" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketplaceOrderTrackingEvent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketplaceReturnClaim" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketplaceReturnClaimEvent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarketplaceReturnClaimLine" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrderSyncJob" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Permission" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StoreMembership" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StoreMembershipPermissionOverride" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StoreOrderSyncState" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StoreRolePermission" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TrendyolFinanceLine" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TrendyolReturnReason" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;
