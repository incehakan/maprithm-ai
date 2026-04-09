import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { PublishItemResult } from "./types";

function legacyPublishStatusFromItem(r: PublishItemResult): string | undefined {
  if (r.status === "FAILED") return "failed";
  if (r.status === "SUCCESS") {
    return r.batchRequestId ? "sent" : "published";
  }
  // PENDING
  return r.batchRequestId ? "sent" : "processing";
}

/**
 * Ürün bazlı publish sonuçlarını ProductMarketplaceMapping üzerinde kalıcı yazar.
 * Güncelleme her zaman { id, storeId } ile yapılır.
 */
export async function persistPublishItemResults(params: {
  storeId: string;
  results: PublishItemResult[];
  /** HTTP öncesi üretilen korelasyon kimliği (Trendyol batch id yoksa iz için). */
  correlationBatchId?: string;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();

  for (const r of params.results) {
    if (!r.mappingId) continue;

    const existing = await prisma.productMarketplaceMapping.findFirst({
      where: { id: r.mappingId, storeId: params.storeId }
    });
    if (!existing) continue;

    const legacy = legacyPublishStatusFromItem(r);
    const data: Prisma.ProductMarketplaceMappingUpdateInput = {
      lastSyncAt: now
    };

    if (legacy) {
      data.publishStatus = legacy;
    }

    const batchOrCorrelation = r.batchRequestId ?? params.correlationBatchId ?? undefined;

    if (r.status === "SUCCESS") {
      data.lastPublishStatus = "SUCCESS";
      data.lastPublishErrorCode = null;
      data.lastPublishErrorMessage = null;
      data.lastSuccessfulPublishAt = now;
      if (r.batchRequestId) {
        data.batchRequestId = r.batchRequestId;
        data.lastPublishBatchId = r.batchRequestId;
      } else if (params.correlationBatchId) {
        data.lastPublishBatchId = params.correlationBatchId;
      }
      data.lastErrorMessage = null;
    } else if (r.status === "FAILED") {
      data.lastPublishStatus = "FAILED";
      data.lastPublishErrorCode = r.errorCode ?? null;
      data.lastPublishErrorMessage = r.errorMessage?.slice(0, 2000) ?? null;
      data.lastErrorMessage = r.errorMessage?.slice(0, 2000) ?? null;
      if (r.batchRequestId) {
        data.batchRequestId = r.batchRequestId;
        data.lastPublishBatchId = r.batchRequestId;
      } else if (params.correlationBatchId) {
        data.lastPublishBatchId = params.correlationBatchId;
      }
    } else {
      data.lastPublishStatus = "PENDING";
      data.lastPublishErrorCode = null;
      data.lastPublishErrorMessage = null;
      if (r.batchRequestId) {
        data.batchRequestId = r.batchRequestId;
        data.lastPublishBatchId = r.batchRequestId;
      } else if (params.correlationBatchId) {
        data.lastPublishBatchId = params.correlationBatchId;
      }
    }

    await prisma.productMarketplaceMapping.updateMany({
      where: { id: r.mappingId, storeId: params.storeId },
      data
    });
  }
}

/** Doğrulama / kapı hatalarında mapping üzerinde kalıcı FAILED yazar. */
export async function persistPublishValidationFailure(params: {
  storeId: string;
  mappingId: string;
  code: string;
  message: string;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  await prisma.productMarketplaceMapping.updateMany({
    where: { id: params.mappingId, storeId: params.storeId },
    data: {
      publishStatus: "failed",
      lastErrorMessage: params.message.slice(0, 2000),
      lastSyncAt: now,
      lastPublishStatus: "FAILED",
      lastPublishErrorCode: params.code,
      lastPublishErrorMessage: params.message.slice(0, 2000),
      lastPublishAttemptAt: now
    }
  });
}

export async function markPublishAttemptPending(params: {
  storeId: string;
  mappingId: string;
  payloadHash: string;
  correlationBatchId: string;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  await prisma.productMarketplaceMapping.updateMany({
    where: { id: params.mappingId, storeId: params.storeId },
    data: {
      publishStatus: "processing",
      lastErrorMessage: null,
      lastSyncAt: now,
      lastPublishStatus: "PENDING",
      lastPublishAttemptAt: now,
      lastPublishBatchId: params.correlationBatchId,
      lastPublishPayloadHash: params.payloadHash,
      lastPublishErrorCode: null,
      lastPublishErrorMessage: null
    }
  });
}
