import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { fetchAndParseXmlFeed } from "@/lib/xmlFeedParser";
import {
  buildXmlFeedSmartDiff,
  type ProductWithHashes,
  type XmlFeedSmartItemBase
} from "@/lib/xmlFeedSmartDiff";
import { trendyolPostJson } from "@/lib/trendyolFetch";
import { buildPriceStockUpdatePayload } from "@/lib/trendyolMarketplaceCommercials";
import { normalizeImageUrls } from "@/lib/productImages";
import {
  releaseXmlFeedSyncLock,
  tryAcquireXmlFeedSyncLock
} from "@/lib/xmlFeedSyncLock";
import { secureXmlFeedSourceUpdateMany } from "@/lib/security/storeScope";
import { hashesFromProductSnapshot, hashesFromXmlRow } from "@/lib/xmlProductHashes";
import { withTrendyolXmlSyncConcurrency } from "@/lib/trendyolXmlSyncConcurrency";
import { publishProductToTrendyol } from "@/lib/trendyolPublishProduct";
import { runTrendyolProductPublishPipeline } from "@/lib/trendyolPublishProductPipeline";
import { logger } from "@/lib/logger";
import { MarketplaceSyncSource } from "@/lib/xml-sync/types";
import {
  markMarketplaceNotApplicable,
  markMarketplacePendingAfterXmlDbUpdate,
  markMarketplaceSyncFailed,
  markMarketplaceSyncPending,
  markMarketplaceSyncSuccess,
  resolveMarketplaceSyncSourceFromXmlKind
} from "@/lib/xml-sync/marketplaceSyncState";

export type SyncSummary = {
  matchedCount: number;
  newCount: number;
  skippedNoChangeCount: number;
  priceOnlyCount: number;
  stockOnlyCount: number;
  priceAndStockCount: number;
  contentChangedCount: number;
  unchangedCount: number;
  missingCount: number;
  missingDeactivatedCount: number;
  trendyolInventoryPushCount: number;
  trendyolPublishCount: number;
  dbWriteCount: number;
};

function toSafeJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function syncPriceStockToTrendyol(params: {
  userId: string;
  storeId: string;
  sellerId: string;
  product: { price: number; stock: number };
  mapping: {
    barcode?: string | null;
    salePrice?: number | null;
    listPrice?: number | null;
    quantity?: number | null;
    useProductPrice?: boolean | null;
    useProductStock?: boolean | null;
  };
}): Promise<boolean> {
  const payload = buildPriceStockUpdatePayload({
    product: { price: params.product.price, stock: params.product.stock },
    mapping: params.mapping
  });
  if (!payload) return false;

  const path = `/integration/inventory/sellers/${encodeURIComponent(
    params.sellerId
  )}/products/price-and-inventory`;
  const apiResult = await trendyolPostJson(params.userId, params.storeId, path, payload);
  return apiResult.ok;
}

async function maybePushTrendyolInventory(params: {
  userId: string;
  storeId: string;
  sellerId: string;
  productId: string;
  mappingPublishStatus: string | null | undefined;
  price: number;
  stock: number;
}): Promise<boolean> {
  if (params.mappingPublishStatus !== "published") return false;
  const mapping = await prisma.productMarketplaceMapping.findFirst({
    where: { productId: params.productId, platform: "trendyol" }
  });
  if (!mapping || mapping.publishStatus !== "published") return false;

  return withTrendyolXmlSyncConcurrency(() =>
    syncPriceStockToTrendyol({
      userId: params.userId,
      storeId: params.storeId,
      sellerId: params.sellerId,
      product: { price: params.price, stock: params.stock },
      mapping
    })
  );
}

function hashPayloadForProduct(
  p: ProductWithHashes,
  overrides?: Partial<{ price: number; stock: number; name: string; description: string | null; brand: string | null; sku: string | null; mainImageUrl: string | null; imageUrls: unknown }>
) {
  return hashesFromProductSnapshot({
    name: overrides?.name ?? p.name,
    description: overrides?.description !== undefined ? overrides.description : p.description,
    brand: overrides?.brand !== undefined ? overrides.brand : p.brand,
    sku: overrides?.sku !== undefined ? overrides.sku : p.sku,
    mainImageUrl: overrides?.mainImageUrl !== undefined ? overrides.mainImageUrl : p.mainImageUrl,
    imageUrls: overrides?.imageUrls !== undefined ? overrides.imageUrls : p.imageUrls,
    price: overrides?.price ?? p.price,
    stock: overrides?.stock ?? p.stock
  });
}

export type RunXmlFeedSyncParams = {
  userId: string;
  storeId: string;
  xmlFeedSourceId: string;
  trigger?: "manual" | "scheduled";
};

export async function runXmlFeedSync(params: RunXmlFeedSyncParams): Promise<SyncSummary> {
  const trigger = params.trigger ?? "manual";

  if (!tryAcquireXmlFeedSyncLock(params.xmlFeedSourceId)) {
    throw new Error("Bu feed için senkron zaten çalışıyor.");
  }

  try {
    const source = await prisma.xmlFeedSource.findFirst({
      where: {
        id: params.xmlFeedSourceId,
        userId: params.userId,
        storeId: params.storeId
      }
    });
    if (!source) {
      throw new Error("XML feed kaynağı bulunamadı.");
    }

    if (!source.isActive) {
      throw new Error("XML feed pasif. Önce aktif hale getirin.");
    }

    const membership = await prisma.storeMembership.findFirst({
      where: {
        userId: params.userId,
        storeId: params.storeId,
        isActive: true
      },
      orderBy: { createdAt: "asc" }
    });
    const membershipId = membership?.id ?? null;

    await createActivityLog({
      userId: params.userId,
      storeId: params.storeId,
      membershipId,
      action: "XML_SYNC_STARTED",
      entityType: "xml_feed_source",
      entityId: source.id,
      message: `${trigger === "scheduled" ? "[Zamanlanmış] " : ""}XML feed akıllı senkron: ${source.name}`
    });

    try {
      const rows = await fetchAndParseXmlFeed(source.feedUrl);
      const productsRaw = await prisma.product.findMany({
        where: {
          userId: params.userId,
          storeId: params.storeId,
          lifecycleStatus: { notIn: ["archived", "deleted"] }
        },
        include: {
          marketplaceMappings: {
            where: { platform: "trendyol" },
            take: 1
          }
        }
      });

      const products: ProductWithHashes[] = productsRaw.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        stock: p.stock,
        sku: p.sku,
        brand: p.brand,
        mainImageUrl: p.mainImageUrl ?? null,
        imageUrls: (p.imageUrls as string[] | null) ?? null,
        mappingBarcode: p.marketplaceMappings[0]?.barcode ?? null,
        mappingStockCode: p.marketplaceMappings[0]?.stockCode ?? null,
        mappingPublishStatus: p.marketplaceMappings[0]?.publishStatus ?? null,
        priceHash: p.priceHash ?? null,
        stockHash: p.stockHash ?? null,
        contentHash: p.contentHash ?? null,
        costPrice:
          p.costPrice != null && Number.isFinite(Number(p.costPrice))
            ? Number(p.costPrice)
            : null
      }));

      const diff = buildXmlFeedSmartDiff({ rows, products });

      const conn = await prisma.marketplaceConnection.findFirst({
        where: { storeId: params.storeId, platform: "trendyol" },
        orderBy: { updatedAt: "desc" }
      });
      const sellerId = String(conn?.sellerId ?? "").trim();
      const canSyncTrendyol = Boolean(conn?.isActive && sellerId);

      let trendyolInventoryPushCount = 0;
      let trendyolPublishCount = 0;
      let dbWriteCount = 0;
      let missingDeactivatedCount = 0;

      const logProduct = async (action: string, productId: string, message: string) => {
        await createActivityLog({
          userId: params.userId,
          storeId: params.storeId,
          membershipId,
          action,
          entityType: "product",
          entityId: productId,
          message
        });
      };

      const hasTrendyolMappingRow = (p: XmlFeedSmartItemBase["product"]) =>
        p.mappingPublishStatus != null;

      const applyCommercial = async (
        item: XmlFeedSmartItemBase,
        kind: "priceOnly" | "stockOnly" | "priceAndStock"
      ) => {
        const { nextPrice, nextStock } = item;
        const syncNow = new Date();
        const h = hashPayloadForProduct(item.product, {
          price: nextPrice,
          stock: nextStock
        });
        const xmlListPrice =
          item.row.price != null && Number.isFinite(Number(item.row.price))
            ? Number(item.row.price)
            : nextPrice;
        const hasCost =
          item.product.costPrice != null &&
          Number.isFinite(Number(item.product.costPrice));
        const data: Prisma.ProductUpdateManyMutationInput = {
          price: nextPrice,
          stock: nextStock,
          priceHash: h.priceHash,
          stockHash: h.stockHash,
          contentHash: h.contentHash,
          lastXmlSyncAt: syncNow,
          ...(!hasCost ? { costPrice: xmlListPrice } : {})
        };

        const n = await prisma.product.updateMany({
          where: { id: item.product.id, storeId: params.storeId },
          data
        });
        if (n.count === 0) return;
        dbWriteCount += 1;

        const kindLabel =
          kind === "priceOnly"
            ? "yalnızca fiyat"
            : kind === "stockOnly"
              ? "yalnızca stok"
              : "fiyat ve stok";
        await logProduct(
          "XML_PRODUCT_UPDATED",
          item.product.id,
          `XML: panel güncellendi (${kindLabel})`
        );

        const source = resolveMarketplaceSyncSourceFromXmlKind(kind);

        if (!canSyncTrendyol) {
          await markMarketplaceNotApplicable({
            productId: item.product.id,
            storeId: params.storeId
          });
          return;
        }

        if (!hasTrendyolMappingRow(item.product)) {
          await markMarketplaceNotApplicable({
            productId: item.product.id,
            storeId: params.storeId
          });
          return;
        }

        if (item.product.mappingPublishStatus !== "published") {
          await markMarketplacePendingAfterXmlDbUpdate({
            productId: item.product.id,
            storeId: params.storeId,
            userId: params.userId,
            membershipId
          });
          return;
        }

        await markMarketplaceSyncPending({
          productId: item.product.id,
          storeId: params.storeId,
          source,
          userId: params.userId,
          membershipId
        });

        const pushed = await maybePushTrendyolInventory({
          userId: params.userId,
          storeId: params.storeId,
          sellerId,
          productId: item.product.id,
          mappingPublishStatus: item.product.mappingPublishStatus,
          price: nextPrice,
          stock: nextStock
        });
        if (pushed) {
          trendyolInventoryPushCount += 1;
          await markMarketplaceSyncSuccess({
            productId: item.product.id,
            storeId: params.storeId,
            source,
            userId: params.userId,
            membershipId
          });
          await logProduct(
            "TRENDYOL_PRICE_STOCK_SYNCED_FROM_XML_FEED",
            item.product.id,
            `XML Smart: Trendyol envanter API kabul etti`
          );
        } else {
          await markMarketplaceSyncFailed({
            productId: item.product.id,
            storeId: params.storeId,
            source,
            errorMessage: "Trendyol fiyat/stok API yanıtı alınamadı veya reddedildi.",
            userId: params.userId,
            membershipId
          });
        }
      };

      for (const item of diff.priceOnly) {
        await applyCommercial(item, "priceOnly");
      }
      for (const item of diff.stockOnly) {
        await applyCommercial(item, "stockOnly");
      }
      for (const item of diff.priceAndStock) {
        await applyCommercial(item, "priceAndStock");
      }

      for (const item of diff.contentChanged) {
        const mergedImageUrls = item.mergedImages.length
          ? item.mergedImages
          : normalizeImageUrls([
              item.row.mainImageUrl ?? null,
              item.row.imageUrls ?? null
            ]);

        const nextName = item.row.normalizedName || item.product.name;
        const nextDesc = item.row.normalizedDescription ?? item.product.description;
        const nextBrand = item.row.normalizedBrand ?? item.product.brand;
        const nextSku = item.row.normalizedSku ?? item.product.sku;

        const hashes = hashesFromProductSnapshot({
          name: nextName,
          description: nextDesc,
          brand: nextBrand,
          sku: nextSku,
          mainImageUrl: mergedImageUrls[0] ?? item.product.mainImageUrl,
          imageUrls: mergedImageUrls.length > 0 ? mergedImageUrls : item.product.imageUrls,
          price: item.nextPrice,
          stock: item.nextStock
        });

        const hasCostBootstrap =
          item.product.costPrice != null &&
          Number.isFinite(Number(item.product.costPrice));

        const contentSyncNow = new Date();
        const nContent = await prisma.product.updateMany({
          where: { id: item.product.id, storeId: params.storeId },
          data: {
            name: nextName,
            description: nextDesc,
            brand: nextBrand,
            sku: nextSku,
            price: item.nextPrice,
            stock: item.nextStock,
            ...(!hasCostBootstrap ? { costPrice: item.nextPrice } : {}),
            mainImageUrl: mergedImageUrls[0] ?? item.product.mainImageUrl,
            imageUrls:
              mergedImageUrls.length > 0
                ? toSafeJson(mergedImageUrls)
                : ((item.product.imageUrls ?? Prisma.JsonNull) as Prisma.InputJsonValue),
            status: "ready",
            lifecycleStatus: "ready",
            priceHash: hashes.priceHash,
            stockHash: hashes.stockHash,
            contentHash: hashes.contentHash,
            lastXmlSyncAt: contentSyncNow
          }
        });
        if (nContent.count === 0) continue;
        dbWriteCount += 1;

        await logProduct(
          "XML_PRODUCT_UPDATED",
          item.product.id,
          `XML: içerik (ve ticari alanlar) güncellendi`
        );

        if (!canSyncTrendyol) {
          await markMarketplaceNotApplicable({
            productId: item.product.id,
            storeId: params.storeId
          });
          continue;
        }

        if (!hasTrendyolMappingRow(item.product)) {
          await markMarketplaceNotApplicable({
            productId: item.product.id,
            storeId: params.storeId
          });
          continue;
        }

        if (item.product.mappingPublishStatus !== "published") {
          await markMarketplacePendingAfterXmlDbUpdate({
            productId: item.product.id,
            storeId: params.storeId,
            userId: params.userId,
            membershipId
          });
          continue;
        }

        await markMarketplaceSyncPending({
          productId: item.product.id,
          storeId: params.storeId,
          source: MarketplaceSyncSource.XML_CONTENT_UPDATE,
          userId: params.userId,
          membershipId
        });

        const pub = await withTrendyolXmlSyncConcurrency(() =>
          runTrendyolProductPublishPipeline({
            userId: params.userId,
            storeId: params.storeId,
            membershipId,
            productId: item.product.id,
            contentRepublishMode: true,
            publishProduct: publishProductToTrendyol,
            skipActivityLog: true
          })
        );

        const first = pub.ok ? pub.batch.results[0] : undefined;
        if (!pub.ok) {
          await markMarketplaceSyncFailed({
            productId: item.product.id,
            storeId: params.storeId,
            source: MarketplaceSyncSource.XML_CONTENT_UPDATE,
            errorMessage: pub.error ?? "Trendyol içerik güncellemesi başarısız.",
            userId: params.userId,
            membershipId
          });
          await logProduct(
            "XML_PRODUCT_UPDATED",
            item.product.id,
            `XML Smart: Trendyol publish başarısız: ${pub.error}`
          );
          continue;
        }

        trendyolPublishCount += 1;
        if (first?.status === "SUCCESS") {
          await markMarketplaceSyncSuccess({
            productId: item.product.id,
            storeId: params.storeId,
            source: MarketplaceSyncSource.XML_CONTENT_UPDATE,
            userId: params.userId,
            membershipId
          });
        } else if (first?.status === "FAILED") {
          await markMarketplaceSyncFailed({
            productId: item.product.id,
            storeId: params.storeId,
            source: MarketplaceSyncSource.XML_CONTENT_UPDATE,
            errorMessage: first.errorMessage ?? "Trendyol içerik isteği reddedildi.",
            userId: params.userId,
            membershipId
          });
        }
      }

      for (const item of diff.newProducts) {
        const imageUrls = normalizeImageUrls([
          item.row.mainImageUrl ?? null,
          item.row.imageUrls ?? null
        ]);
        const hr = hashesFromXmlRow(
          item.row,
          item.row.price != null && Number.isFinite(item.row.price) ? Number(item.row.price) : 0,
          item.row.stock != null && Number.isFinite(item.row.stock)
            ? Math.round(item.row.stock)
            : 0
        );
        const nextPrice =
          item.row.price != null && Number.isFinite(item.row.price) ? item.row.price : 0;
        const nextStock =
          item.row.stock != null && Number.isFinite(item.row.stock)
            ? Math.max(0, Math.round(item.row.stock))
            : 0;

        const createdAt = new Date();
        const created = await prisma.product.create({
          data: {
            userId: params.userId,
            storeId: params.storeId,
            name: item.row.normalizedName || `XML Ürün #${item.row.rowIndex}`,
            description: item.row.normalizedDescription ?? null,
            price: nextPrice,
            stock: nextStock,
            costPrice: nextPrice,
            sku: item.row.normalizedSku ?? null,
            brand: item.row.normalizedBrand ?? null,
            status: "ready",
            lifecycleStatus: "ready",
            mainImageUrl: imageUrls[0] ?? null,
            imageUrls: imageUrls.length > 0 ? toSafeJson(imageUrls) : Prisma.JsonNull,
            priceHash: hr.priceHash,
            stockHash: hr.stockHash,
            contentHash: hr.contentHash,
            lastXmlSyncAt: createdAt,
            marketplaceSyncStatus: "NOT_APPLICABLE",
            marketplaceSyncError: null,
            marketplaceSyncSource: null
          }
        });
        dbWriteCount += 1;
        await logProduct(
          "XML_PRODUCT_UPDATED",
          created.id,
          `XML: yeni ürün oluşturuldu (feed eşleşmesi)`
        );
      }

      if (source.deactivateMissingFromFeed && diff.missingFromFeed.length > 0) {
        for (const p of diff.missingFromFeed) {
          const hm = hashPayloadForProduct(p, { stock: 0 });
          const deactNow = new Date();
          await prisma.product.updateMany({
            where: { id: p.id, storeId: params.storeId },
            data: {
              stock: 0,
              lifecycleStatus: "draft",
              status: "draft",
              priceHash: hm.priceHash,
              stockHash: hm.stockHash,
              contentHash: hm.contentHash,
              lastXmlSyncAt: deactNow,
              marketplaceSyncStatus: "NOT_APPLICABLE",
              marketplaceSyncError: null,
              marketplaceSyncSource: null
            }
          });
          missingDeactivatedCount += 1;
          await logProduct(
            "PRODUCT_DEACTIVATED_FROM_XML_FEED_MISSING",
            p.id,
            `XML feed'de bulunamadı; stok 0 ve taslak: ${p.name}`
          );
        }
      }

      const skippedNoChangeCount = diff.skippedNoChange.length;
      if (skippedNoChangeCount > 0) {
        await createActivityLog({
          userId: params.userId,
          storeId: params.storeId,
          membershipId,
          action: "SKIPPED_NO_CHANGE",
          entityType: "xml_feed_source",
          entityId: source.id,
          message: `XML Smart: ${skippedNoChangeCount} ürün değişmedi (hash eşleşmesi)`
        });
      }

      const summary: SyncSummary = {
        matchedCount: diff.matchedCount,
        newCount: diff.newProducts.length,
        skippedNoChangeCount,
        priceOnlyCount: diff.priceOnly.length,
        stockOnlyCount: diff.stockOnly.length,
        priceAndStockCount: diff.priceAndStock.length,
        contentChangedCount: diff.contentChanged.length,
        unchangedCount: skippedNoChangeCount,
        missingCount: diff.missingFromFeed.length,
        missingDeactivatedCount,
        trendyolInventoryPushCount,
        trendyolPublishCount,
        dbWriteCount
      };

      const now = new Date();
      await secureXmlFeedSourceUpdateMany(source.id, params.storeId, {
        lastSyncedAt: now,
        lastSyncStatus: "success",
        lastSyncProductsUpdated: dbWriteCount,
        lastSyncSkippedCount: skippedNoChangeCount,
        lastSyncPublishedCount: trendyolPublishCount,
        lastSyncInventoryPushCount: trendyolInventoryPushCount,
        lastSyncMessage: `DB yazım: ${dbWriteCount}, atlanan: ${skippedNoChangeCount}, Trendyol envanter: ${trendyolInventoryPushCount}, Trendyol publish: ${trendyolPublishCount}`
      });

      await createActivityLog({
        userId: params.userId,
        storeId: params.storeId,
        membershipId,
        action: "XML_SYNC_COMPLETED",
        entityType: "xml_feed_source",
        entityId: source.id,
        message: `XML Smart bitti: ${source.name} — atlanan ${skippedNoChangeCount}, güncellenen ${dbWriteCount}, publish ${trendyolPublishCount}`
      });

      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Senkron başarısız.";
      logger.error("xml_sync_failed", {
        helper: "runXmlFeedSync",
        storeId: params.storeId,
        userId: params.userId,
        entityId: source.id,
        message
      });
      await secureXmlFeedSourceUpdateMany(source.id, params.storeId, {
        lastSyncedAt: new Date(),
        lastSyncStatus: "failed",
        lastSyncProductsUpdated: 0,
        lastSyncSkippedCount: 0,
        lastSyncPublishedCount: 0,
        lastSyncInventoryPushCount: 0,
        lastSyncMessage: message.slice(0, 1000)
      });
      await createActivityLog({
        userId: params.userId,
        storeId: params.storeId,
        membershipId,
        action: "XML_SYNC_FAILED",
        entityType: "xml_feed_source",
        entityId: source.id,
        message: `XML senkron hata: ${source.name} — ${message.slice(0, 500)}`
      });
      throw error;
    }
  } finally {
    releaseXmlFeedSyncLock(params.xmlFeedSourceId);
  }
}