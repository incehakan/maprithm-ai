/**
 * Multi-tenant store izolasyonu: API ve Prisma katmanında tekrarlayan güvenli desenler.
 * Tek başına `id` ile find/update/delete yapılmamalı; mümkünse `storeId` (ve gerekiyorsa `userId`) birlikte kullanılmalı.
 *
 * Route standardı: `requireActiveStore` → kayıt `findFirst({ id, storeId, ... })` → yoksa 404 (başka mağaza ile aynı mesaj);
 * yazma: `updateMany({ where: { id, storeId }, data })` veya bu dosyadaki `secure*UpdateMany` yardımcıları.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/** İstemciye sızdırmayan genel mesaj (yok / başka mağaza aynı 404) */
export const STORE_SCOPED_NOT_FOUND_MESSAGE = "Kayıt bulunamadı.";

export type StoreScopeSecurityEvent =
  | "STORE_SCOPE_MISMATCH"
  | "STORE_SCOPED_ENTITY_NOT_FOUND"
  | "STORE_UNAUTHORIZED_ACCESS_ATTEMPT";

export function logStoreScopeSecurity(params: {
  event: StoreScopeSecurityEvent;
  userId?: string | null;
  storeId?: string | null;
  targetEntity: string;
  targetId?: string | null;
  route?: string;
  action?: string;
}): void {
  logger.warn("store_scope_security", {
    helper: "storeScope",
    ...params
  });
}

export async function secureProductUpdateMany(
  productId: string,
  storeId: string,
  data: Prisma.ProductUpdateManyMutationInput
) {
  return prisma.product.updateMany({
    where: { id: productId, storeId },
    data
  });
}

export async function secureProductMarketplaceMappingUpdateMany(
  mappingId: string,
  storeId: string,
  data: Prisma.ProductMarketplaceMappingUpdateManyMutationInput
) {
  return prisma.productMarketplaceMapping.updateMany({
    where: { id: mappingId, storeId },
    data
  });
}

export async function secureImportJobUpdateMany(
  jobId: string,
  storeId: string,
  data: Prisma.ImportJobUpdateManyMutationInput
) {
  return prisma.importJob.updateMany({
    where: { id: jobId, storeId },
    data
  });
}

export async function secureMarketplaceConnectionUpdateMany(
  connectionId: string,
  storeId: string,
  data: Prisma.MarketplaceConnectionUpdateManyMutationInput
) {
  return prisma.marketplaceConnection.updateMany({
    where: { id: connectionId, storeId },
    data
  });
}

export async function secureXmlFeedSourceUpdateMany(
  feedId: string,
  storeId: string,
  data: Prisma.XmlFeedSourceUpdateManyMutationInput
) {
  return prisma.xmlFeedSource.updateMany({
    where: { id: feedId, storeId },
    data
  });
}

/** Sipariş güncellemeleri — tek başına `id` ile `update` kullanılmamalı. */
export async function secureMarketplaceOrderUpdateMany(
  orderId: string,
  storeId: string,
  data: Prisma.MarketplaceOrderUpdateManyMutationInput
) {
  return prisma.marketplaceOrder.updateMany({
    where: { id: orderId, storeId },
    data
  });
}

/** OrderSyncJob — arka plan kuyruğu; yazımlarda `storeId` ile sınırlandırılmalı. */
export async function secureOrderSyncJobUpdateMany(
  jobId: string,
  storeId: string,
  data: Prisma.OrderSyncJobUpdateManyMutationInput
) {
  return prisma.orderSyncJob.updateMany({
    where: { id: jobId, storeId },
    data
  });
}
