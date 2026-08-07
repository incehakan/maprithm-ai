import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { trendyolPostJson } from "@/lib/trendyolFetch";
import { extractBatchRequestId } from "@/lib/trendyolCreateProductPayload";
import {
  buildPriceStockUpdatePayload,
  resolveMarketplaceListPrice,
  resolveMarketplaceQuantity,
  resolveMarketplaceSalePrice
} from "@/lib/trendyolMarketplaceCommercials";
import {
  markMarketplaceSyncFailed,
  markMarketplaceSyncSuccess
} from "@/lib/xml-sync/marketplaceSyncState";
import { MarketplaceSyncSource } from "@/lib/xml-sync/types";

export type PushPriceStockResult =
  | {
      ok: true;
      batchRequestId: string | null;
      salePrice: number;
      listPrice: number;
      quantity: number;
    }
  | { ok: false; error: string; status: number };

/**
 * Mevcut Product.price / stock değerini Trendyol'a (price-and-inventory) gönderir.
 * /api/integrations/trendyol/update-price-stock route'u ve otomatik yeniden
 * fiyatlandırma (buybox repricing) orkestratörü tarafından ortak kullanılır —
 * fiyat/para ile ilgili tek bir doğrulanmış yol olsun diye kasıtlı olarak paylaşılıyor.
 */
export async function pushPriceStockUpdateToTrendyol(params: {
  userId: string;
  storeId: string;
  membershipId?: string | null;
  productId: string;
}): Promise<PushPriceStockResult> {
  const { userId, storeId, membershipId, productId } = params;

  const product = await prisma.product.findFirst({
    where: { id: productId, userId, storeId }
  });
  if (!product) {
    return { ok: false, error: "Ürün bulunamadı.", status: 404 };
  }

  const mapping = await prisma.productMarketplaceMapping.findUnique({
    where: { productId_platform: { productId, platform: "trendyol" } }
  });
  if (!mapping || mapping.storeId !== storeId) {
    return { ok: false, error: "Trendyol mapping kaydı bulunamadı.", status: 400 };
  }

  const barcode = String(mapping.barcode ?? "").trim();
  if (!barcode) {
    return { ok: false, error: "Barkod bulunamadı.", status: 400 };
  }

  const salePrice = resolveMarketplaceSalePrice(
    { price: Number(product.price), stock: product.stock },
    mapping
  );
  const listPrice = resolveMarketplaceListPrice(
    { price: Number(product.price), stock: product.stock },
    mapping
  );
  const quantity = resolveMarketplaceQuantity(
    { price: Number(product.price), stock: product.stock },
    mapping
  );

  if (salePrice == null || !Number.isFinite(salePrice) || salePrice <= 0) {
    return { ok: false, error: "Satış fiyatı geçersiz.", status: 400 };
  }
  if (quantity == null || !Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, error: "Stok değeri geçersiz.", status: 400 };
  }

  const payload = buildPriceStockUpdatePayload({
    product: { price: Number(product.price), stock: product.stock },
    mapping
  });
  if (!payload) {
    return { ok: false, error: "Fiyat/stok güncellemesi gönderilemedi.", status: 400 };
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId, platform: "trendyol" } }
  });
  const sellerId = String(conn?.sellerId ?? "").trim();
  if (!conn?.isActive || !sellerId) {
    return { ok: false, error: "Trendyol bağlantısı bulunamadı.", status: 400 };
  }

  const path = `/integration/inventory/sellers/${encodeURIComponent(
    sellerId
  )}/products/price-and-inventory`;
  const apiResult = await trendyolPostJson<unknown>(userId, storeId, path, payload);

  if (!apiResult.ok) {
    await prisma.productMarketplaceMapping.updateMany({
      where: { id: mapping.id, storeId },
      data: { lastErrorMessage: apiResult.message.slice(0, 2000), lastSyncAt: new Date() }
    });
    await markMarketplaceSyncFailed({
      productId,
      storeId,
      source: MarketplaceSyncSource.MANUAL_PRICE_STOCK_UPDATE,
      errorMessage: apiResult.message,
      userId,
      membershipId
    });
    await createActivityLog({
      userId,
      storeId,
      membershipId: membershipId ?? undefined,
      action: "TRENDYOL_PRICE_STOCK_UPDATE_FAILED",
      entityType: "PRODUCT",
      entityId: productId,
      message: "Trendyol fiyat/stok güncellemesi başarısız oldu"
    });
    return {
      ok: false,
      error: "Fiyat/stok güncellemesi gönderilemedi.",
      status: apiResult.status >= 400 ? apiResult.status : 502
    };
  }

  const batchRequestId = extractBatchRequestId(apiResult.data);
  const now = new Date();

  await prisma.productMarketplaceMapping.updateMany({
    where: { id: mapping.id, storeId },
    data: {
      batchRequestId: batchRequestId ?? mapping.batchRequestId ?? null,
      publishStatus: "processing",
      lastSyncAt: now,
      lastErrorMessage: null
    }
  });

  await markMarketplaceSyncSuccess({
    productId,
    storeId,
    source: MarketplaceSyncSource.MANUAL_PRICE_STOCK_UPDATE,
    userId,
    membershipId
  });

  if (batchRequestId) {
    await prisma.trendyolPublishJob.upsert({
      where: { storeId_batchRequestId: { storeId, batchRequestId } },
      create: {
        userId,
        storeId,
        batchRequestId,
        platform: "trendyol",
        batchStatus: "IN_PROGRESS",
        itemCount: 1,
        successCount: 0,
        failedCount: 0,
        pendingCount: 1,
        batchRequestType: "ProductInventoryUpdate",
        lastSyncMessage: "Fiyat/stok güncelleme isteği Trendyol kuyruğuna alındı."
      },
      update: {
        batchStatus: "IN_PROGRESS",
        itemCount: 1,
        pendingCount: 1,
        batchRequestType: "ProductInventoryUpdate",
        lastSyncMessage: "Fiyat/stok güncelleme isteği Trendyol kuyruğuna alındı."
      }
    });
  }

  await createActivityLog({
    userId,
    storeId,
    membershipId: membershipId ?? undefined,
    action: "TRENDYOL_PRICE_STOCK_UPDATE_REQUESTED",
    entityType: "PRODUCT",
    entityId: productId,
    message: "Trendyol fiyat/stok güncellemesi gönderildi"
  });

  return {
    ok: true,
    batchRequestId,
    salePrice,
    listPrice: listPrice ?? salePrice,
    quantity
  };
}
