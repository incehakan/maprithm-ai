import { prisma } from "@/lib/prisma";
import { trendyolFetch } from "@/lib/trendyolFetch";
import { createActivityLog } from "@/lib/activityLog";
import {
  batchItemMatchesMapping,
  friendlyBatchApiError,
  parseTrendyolBatchRequestResult,
  type ParsedBatchItem,
  type ParsedBatchResult
} from "@/lib/trendyolBatchRequestResult";
import { TrendyolPublishRuntimeErrorCode } from "@/lib/validation/trendyolPublishErrorCodes";

export type MappingSyncRow = {
  mappingId: string;
  productId: string;
  productName: string;
  previousPublishStatus: string;
  newPublishStatus: string;
  matched: boolean;
  detail: string | null;
};

export type SyncTrendyolBatchFailReason =
  | "bad_batch_id"
  | "no_mappings"
  | "no_connection"
  | "trendyol_api";

export type SyncTrendyolBatchResult = {
  ok: boolean;
  failReason?: SyncTrendyolBatchFailReason;
  userMessage: string;
  parsed: ParsedBatchResult | null;
  mappings: MappingSyncRow[];
  jobRecord: {
    successCount: number;
    failedCount: number;
    pendingCount: number;
    itemCount: number;
    batchStatus: string | null;
  } | null;
};

function countItemStatuses(items: ParsedBatchItem[]) {
  let successCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  for (const it of items) {
    if (it.status === "SUCCESS") successCount += 1;
    else if (it.status === "FAILED") failedCount += 1;
    else if (it.status === "IN_PROGRESS") pendingCount += 1;
  }
  return { successCount, failedCount, pendingCount };
}

function trimMessage(s: string, max = 2000): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function isPriceStockBatchType(batchRequestType: string | null): boolean {
  const t = (batchRequestType ?? "").toUpperCase();
  return t.includes("PRICE") || t.includes("INVENTORY");
}

function isArchiveTrueBatchType(batchRequestType: string | null): boolean {
  const t = (batchRequestType ?? "").toUpperCase();
  return t.includes("ARCHIVE_TRUE") || t === "PRODUCTARCHIVE";
}

function isArchiveFalseBatchType(batchRequestType: string | null): boolean {
  const t = (batchRequestType ?? "").toUpperCase();
  return t.includes("ARCHIVE_FALSE") || t === "PRODUCTUNARCHIVE";
}

/**
 * Trendyol batch sonucunu çeker, mapping ve TrendyolPublishJob kayıtlarını günceller.
 */
export async function syncTrendyolBatchResultForUser(
  userId: string,
  storeId: string,
  batchRequestIdRaw: string
): Promise<SyncTrendyolBatchResult> {
  const batchRequestId = batchRequestIdRaw.trim();
  if (!batchRequestId) {
    return {
      ok: false,
      failReason: "bad_batch_id",
      userMessage: "batchRequestId boş olamaz.",
      parsed: null,
      mappings: [],
      jobRecord: null
    };
  }

  const mappings = await prisma.productMarketplaceMapping.findMany({
    where: {
      userId,
      storeId,
      platform: "trendyol",
      batchRequestId
    },
    include: {
      product: { select: { id: true, name: true } }
    }
  });
  const existingJob = await prisma.trendyolPublishJob.findUnique({
    where: { storeId_batchRequestId: { storeId, batchRequestId } }
  });

  if (mappings.length === 0) {
    return {
      ok: false,
      failReason: "no_mappings",
      userMessage:
        "Bu batch kimliği ile eşleşen Trendyol eşlemeniz yok. Ürünü Trendyol'a gönderdiğiniz hesapta mı kontrol edin.",
      parsed: null,
      mappings: [],
      jobRecord: null
    };
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId, platform: "trendyol" } }
  });
  const sellerId = conn?.sellerId?.trim();
  if (!conn?.isActive || !sellerId) {
    return {
      ok: false,
      failReason: "no_connection",
      userMessage:
        "Aktif Trendyol bağlantısı veya satıcı ID yok. Ayarlar → Trendyol'dan bağlantıyı tamamlayın.",
      parsed: null,
      mappings: [],
      jobRecord: null
    };
  }

  const path = `/integration/product/sellers/${encodeURIComponent(
    sellerId
  )}/products/batch-requests/${encodeURIComponent(batchRequestId)}`;

  const api = await trendyolFetch<unknown>(userId, storeId, path);
  if (!api.ok) {
    return {
      ok: false,
      failReason: "trendyol_api",
      userMessage: friendlyBatchApiError(api.status, api.message),
      parsed: null,
      mappings: [],
      jobRecord: null
    };
  }

  const parsed = parseTrendyolBatchRequestResult(api.data);
  const items = parsed.items;
  const effectiveBatchType = parsed.batchRequestType ?? existingJob?.batchRequestType ?? null;
  const isPriceStockBatch = isPriceStockBatchType(effectiveBatchType);
  const isArchiveBatch = isArchiveTrueBatchType(effectiveBatchType);
  const isUnarchiveBatch = isArchiveFalseBatchType(effectiveBatchType);
  const batchCompleted =
    (parsed.batchStatus ?? "").toUpperCase() === "COMPLETED";

  const countsFromItems = countItemStatuses(items);
  const itemCount =
    parsed.itemCount > 0 ? parsed.itemCount : items.length;

  const syncRows: MappingSyncRow[] = [];
  const usedItemIndexes = new Set<number>();

  if (items.length === 0) {
    await prisma.trendyolPublishJob.upsert({
      where: {
        storeId_batchRequestId: { storeId, batchRequestId }
      },
      create: {
        userId,
        storeId,
        batchRequestId,
        platform: "trendyol",
        batchStatus: parsed.batchStatus,
        itemCount,
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
        batchRequestType: parsed.batchRequestType,
        lastSyncMessage:
          "Yanıtta ürün satırı yok; batch tamamlanmamış veya farklı işlem tipi olabilir."
      },
      update: {
        batchStatus: parsed.batchStatus,
        itemCount,
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
        batchRequestType: parsed.batchRequestType,
        lastSyncMessage:
          "Yanıtta ürün satırı yok; batch tamamlanmamış veya farklı işlem tipi olabilir."
      }
    });

    await createActivityLog({
      userId,
      storeId,
      action: "TRENDYOL_BATCH_RESULT_SYNCED",
      entityType: "trendyol_publish_job",
      entityId: batchRequestId,
      message: "Trendyol batch sonucu senkronize edildi; ürün eşlemeleri güncellendi."
    });

    return {
      ok: true,
      userMessage:
        "Batch yanıtı alındı ancak ürün satırı listelenmedi. İşlem sürüyor olabilir; kısa süre sonra tekrar deneyin.",
      parsed,
      mappings: syncRows,
      jobRecord: {
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
        itemCount,
        batchStatus: parsed.batchStatus
      }
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const m of mappings) {
      const prev = m.publishStatus;
      let idx = -1;
      for (let i = 0; i < items.length; i++) {
        if (usedItemIndexes.has(i)) continue;
        if (
          batchItemMatchesMapping(
            {
              barcode: m.barcode,
              stockCode: m.stockCode,
              productMainId: m.productMainId
            },
            items[i]
          )
        ) {
          idx = i;
          break;
        }
      }

      if (idx < 0) {
        const msg = batchCompleted
          ? "Toplu işlem tamamlandı ancak yanıtta bu ürün satırı bulunamadı (barkod / stok kodu eşleşmedi)."
          : "Batch yanıtında bu ürün satırı henüz yok veya işlem sürüyor; daha sonra tekrar deneyin.";
        if (batchCompleted) {
          await tx.productMarketplaceMapping.updateMany({
            where: { id: m.id, storeId },
            data: {
              publishStatus: "failed",
              lastErrorMessage: trimMessage(msg),
              lastPublishStatus: "FAILED",
              lastPublishErrorCode:
                TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_BARCODE_MATCH_FAILED,
              lastPublishErrorMessage: trimMessage(msg),
              lastSyncAt: new Date()
            }
          });
        }
        syncRows.push({
          mappingId: m.id,
          productId: m.product.id,
          productName: m.product.name,
          previousPublishStatus: prev,
          newPublishStatus: batchCompleted ? "failed" : prev,
          matched: false,
          detail: msg
        });
        continue;
      }

      usedItemIndexes.add(idx);
      const it = items[idx];
      let newStatus = prev;
      let err: string | null = null;

      if (it.status === "SUCCESS") {
        if (isArchiveBatch) {
          newStatus = "archived";
        } else if (isUnarchiveBatch) {
          newStatus = "published";
        } else if (isPriceStockBatch) {
          newStatus = m.publishedAt ? "published" : prev;
        } else {
          newStatus = "published";
        }
        err = null;
      } else if (it.status === "FAILED") {
        newStatus = "failed";
        err =
          it.failureReasons.length > 0
            ? it.failureReasons.join(" · ")
            : "Trendyol ürün oluşturma reddedildi.";
      } else if (it.status === "IN_PROGRESS") {
        newStatus = "processing";
        err = null;
      } else {
        newStatus = batchCompleted ? "failed" : "processing";
        err = batchCompleted
          ? "Bilinmeyen öğe durumu."
          : "İşlem durumu net değil; tekrar kontrol edin.";
      }

      const syncNow = new Date();
      let lastPublishStatus: "SUCCESS" | "FAILED" | "PENDING" = "PENDING";
      let lastPublishErrorCode: string | null = null;
      let lastPublishErrorMessage: string | null = null;
      let lastSuccessfulPublishAt: Date | null | undefined = undefined;

      if (it.status === "SUCCESS") {
        lastPublishStatus = "SUCCESS";
        lastPublishErrorCode = null;
        lastPublishErrorMessage = null;
        if (
          newStatus === "published" &&
          !isPriceStockBatch &&
          !isArchiveBatch
        ) {
          lastSuccessfulPublishAt = syncNow;
        }
      } else if (it.status === "FAILED") {
        lastPublishStatus = "FAILED";
        lastPublishErrorCode = TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_ITEM_FAILED;
        lastPublishErrorMessage = err != null ? trimMessage(err) : null;
      } else if (it.status === "IN_PROGRESS") {
        lastPublishStatus = "PENDING";
      } else {
        lastPublishStatus = batchCompleted ? "FAILED" : "PENDING";
        if (batchCompleted) {
          lastPublishErrorCode =
            TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_ITEM_FAILED;
          lastPublishErrorMessage = err != null ? trimMessage(err) : null;
        }
      }

      await tx.productMarketplaceMapping.updateMany({
        where: { id: m.id, storeId },
        data: {
          publishStatus: newStatus,
          lastErrorMessage: err != null ? trimMessage(err) : null,
          lastSyncAt: syncNow,
          lastPublishStatus,
          lastPublishErrorCode,
          lastPublishErrorMessage,
          ...(lastSuccessfulPublishAt ? { lastSuccessfulPublishAt } : {}),
          ...(newStatus === "archived" ? { archivedAt: syncNow } : {}),
          ...(newStatus === "published" ? { archivedAt: null, unpublishedAt: null } : {}),
          ...(newStatus === "published" && !isPriceStockBatch
            ? { publishedAt: syncNow }
            : {})
        }
      });

      if (newStatus === "archived") {
        await tx.product.updateMany({
          where: { id: m.product.id, storeId },
          data: {
            lifecycleStatus: "archived",
            archivedAt: syncNow
          }
        });
      } else if (newStatus === "published") {
        await tx.product.updateMany({
          where: { id: m.product.id, storeId },
          data: {
            lifecycleStatus: "published",
            publishedAt: syncNow,
            archivedAt: null,
            unpublishedAt: null
          }
        });
      }

      if (
        it.status === "SUCCESS" &&
        (isPriceStockBatch || (!isArchiveBatch && newStatus === "published"))
      ) {
        await tx.product.updateMany({
          where: { id: m.product.id, storeId },
          data: {
            marketplaceSyncStatus: "SYNCED",
            lastMarketplaceSyncAt: syncNow,
            marketplaceSyncError: null
          }
        });
      } else if (it.status === "FAILED") {
        await tx.product.updateMany({
          where: { id: m.product.id, storeId },
          data: {
            marketplaceSyncStatus: "FAILED",
            marketplaceSyncError: err != null ? trimMessage(err) : "Trendyol işlemi reddedildi."
          }
        });
      }

      syncRows.push({
        mappingId: m.id,
        productId: m.product.id,
        productName: m.product.name,
        previousPublishStatus: prev,
        newPublishStatus: newStatus,
        matched: true,
        detail: err
      });
    }

    await tx.trendyolPublishJob.upsert({
      where: {
        storeId_batchRequestId: { storeId, batchRequestId }
      },
      create: {
        userId,
        storeId,
        batchRequestId,
        platform: "trendyol",
        batchStatus: parsed.batchStatus,
        itemCount,
        successCount: countsFromItems.successCount,
        failedCount: countsFromItems.failedCount,
        pendingCount: countsFromItems.pendingCount,
        batchRequestType: effectiveBatchType,
        lastSyncMessage: "Batch sonucu senkronize edildi."
      },
      update: {
        batchStatus: parsed.batchStatus,
        itemCount,
        successCount: countsFromItems.successCount,
        failedCount: countsFromItems.failedCount,
        pendingCount: countsFromItems.pendingCount,
        batchRequestType: effectiveBatchType,
        lastSyncMessage: "Batch sonucu senkronize edildi."
      }
    });
  });

  await createActivityLog({
    userId,
    storeId,
    action: "TRENDYOL_BATCH_RESULT_SYNCED",
    entityType: "trendyol_publish_job",
    entityId: batchRequestId,
    message: "Trendyol batch sonucu senkronize edildi; ürün eşlemeleri güncellendi."
  });

  // Mesaj kullanıcı isteğine uygun genel metin + özet
  const okCount = syncRows.filter((r) => r.matched && r.newPublishStatus !== "failed").length;
  const failCount = syncRows.filter((r) => r.newPublishStatus === "failed").length;

  const userMessage = isPriceStockBatch
    ? `Fiyat/stok batch sonucu alındı. ${okCount} ürün güncellendi, ${failCount} başarısız veya hatalı. Toplam ${items.length} Trendyol satırı işlendi.`
    : isArchiveBatch
      ? `Arşivleme batch sonucu alındı. ${okCount} ürün arşivlendi, ${failCount} başarısız veya hatalı. Toplam ${items.length} Trendyol satırı işlendi.`
      : isUnarchiveBatch
        ? `Arşivden çıkarma batch sonucu alındı. ${okCount} ürün tekrar aktifleştirildi, ${failCount} başarısız veya hatalı. Toplam ${items.length} Trendyol satırı işlendi.`
    : `Batch sonucu alındı. ${okCount} ürün yayında olarak güncellendi, ${failCount} başarısız veya hatalı. Toplam ${items.length} Trendyol satırı işlendi.`;

  return {
    ok: true,
    userMessage,
    parsed,
    mappings: syncRows,
    jobRecord: {
      successCount: countsFromItems.successCount,
      failedCount: countsFromItems.failedCount,
      pendingCount: countsFromItems.pendingCount,
      itemCount,
      batchStatus: parsed.batchStatus
    }
  };
}
