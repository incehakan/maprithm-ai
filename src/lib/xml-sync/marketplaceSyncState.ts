import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import type { Prisma } from "@prisma/client";
import {
  MarketplaceSyncSource,
  type MarketplaceSyncSourceValue,
  type MarketplaceSyncStatus
} from "./types";

export type XmlCommercialKind = "priceOnly" | "stockOnly" | "priceAndStock";

export function resolveMarketplaceSyncSourceFromXmlKind(
  kind: XmlCommercialKind
): MarketplaceSyncSourceValue {
  if (kind === "priceOnly") return MarketplaceSyncSource.XML_PRICE_UPDATE;
  if (kind === "stockOnly") return MarketplaceSyncSource.XML_STOCK_UPDATE;
  return MarketplaceSyncSource.XML_PRICE_STOCK_UPDATE;
}

const STATUS: Record<string, MarketplaceSyncStatus> = {
  SYNCED: "SYNCED",
  FAILED: "FAILED",
  PENDING: "PENDING",
  NOT_APPLICABLE: "NOT_APPLICABLE"
};

function trimErr(msg: string, max = 500): string {
  const t = msg.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export async function markXmlSyncUpdated(params: {
  productId: string;
  storeId: string;
  now?: Date;
  extraData?: Prisma.ProductUpdateManyMutationInput;
}): Promise<void> {
  const now = params.now ?? new Date();
  await prisma.product.updateMany({
    where: { id: params.productId, storeId: params.storeId },
    data: {
      lastXmlSyncAt: now,
      ...(params.extraData ?? {})
    }
  });
}

export async function markMarketplaceSyncPending(params: {
  productId: string;
  storeId: string;
  source: MarketplaceSyncSourceValue | null;
  userId?: string;
  membershipId?: string | null;
  log?: boolean;
  now?: Date;
}): Promise<void> {
  await prisma.product.updateMany({
    where: { id: params.productId, storeId: params.storeId },
    data: {
      marketplaceSyncStatus: STATUS.PENDING,
      marketplaceSyncSource: params.source,
      marketplaceSyncError: null
    }
  });
  if (params.log !== false && params.userId) {
    await createActivityLog({
      userId: params.userId,
      storeId: params.storeId,
      membershipId: params.membershipId ?? undefined,
      action: "MARKETPLACE_SYNC_PENDING",
      entityType: "product",
      entityId: params.productId,
      message: `Trendyol senkron bekliyor · storeId=${params.storeId} · productId=${params.productId} · source=${params.source ?? "—"}`
    });
  }
}

export async function markMarketplaceSyncSuccess(params: {
  productId: string;
  storeId: string;
  source: MarketplaceSyncSourceValue | null;
  userId?: string;
  membershipId?: string | null;
  log?: boolean;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  await prisma.product.updateMany({
    where: { id: params.productId, storeId: params.storeId },
    data: {
      marketplaceSyncStatus: STATUS.SYNCED,
      lastMarketplaceSyncAt: now,
      marketplaceSyncSource: params.source,
      marketplaceSyncError: null
    }
  });
  if (params.log !== false && params.userId) {
    await createActivityLog({
      userId: params.userId,
      storeId: params.storeId,
      membershipId: params.membershipId ?? undefined,
      action: "MARKETPLACE_SYNC_SUCCEEDED",
      entityType: "product",
      entityId: params.productId,
      message: `Trendyol senkron tamam · storeId=${params.storeId} · productId=${params.productId} · source=${params.source ?? "—"} · status=SYNCED`
    });
  }
}

export async function markMarketplaceSyncFailed(params: {
  productId: string;
  storeId: string;
  source: MarketplaceSyncSourceValue | null;
  errorMessage: string;
  userId?: string;
  membershipId?: string | null;
  log?: boolean;
  now?: Date;
}): Promise<void> {
  await prisma.product.updateMany({
    where: { id: params.productId, storeId: params.storeId },
    data: {
      marketplaceSyncStatus: STATUS.FAILED,
      marketplaceSyncSource: params.source,
      marketplaceSyncError: trimErr(params.errorMessage, 1000)
      // lastMarketplaceSyncAt bilinçli olarak dokunulmuyor (son başarılı an korunur)
    }
  });
  if (params.log !== false && params.userId) {
    await createActivityLog({
      userId: params.userId,
      storeId: params.storeId,
      membershipId: params.membershipId ?? undefined,
      action: "MARKETPLACE_SYNC_FAILED",
      entityType: "product",
      entityId: params.productId,
      message: `Trendyol senkron hata · storeId=${params.storeId} · productId=${params.productId} · source=${params.source ?? "—"} · ${trimErr(params.errorMessage, 240)}`
    });
  }
}

export async function markMarketplaceNotApplicable(params: {
  productId: string;
  storeId: string;
  now?: Date;
}): Promise<void> {
  await prisma.product.updateMany({
    where: { id: params.productId, storeId: params.storeId },
    data: {
      marketplaceSyncStatus: STATUS.NOT_APPLICABLE,
      marketplaceSyncSource: null,
      marketplaceSyncError: null
    }
  });
}

/**
 * XML ile DB güncellendi; Trendyol eşlemesi var ama ürün Trendyol’da yayında değil →
 * panel verisi ileride yansıtılmayı bekler.
 */
export async function markMarketplacePendingAfterXmlDbUpdate(params: {
  productId: string;
  storeId: string;
  userId?: string;
  membershipId?: string | null;
  now?: Date;
  log?: boolean;
}): Promise<void> {
  await prisma.product.updateMany({
    where: { id: params.productId, storeId: params.storeId },
    data: {
      marketplaceSyncStatus: STATUS.PENDING,
      marketplaceSyncSource: null,
      marketplaceSyncError: null
    }
  });
  if (params.log !== false && params.userId) {
    await createActivityLog({
      userId: params.userId,
      storeId: params.storeId,
      membershipId: params.membershipId ?? undefined,
      action: "MARKETPLACE_SYNC_PENDING",
      entityType: "product",
      entityId: params.productId,
      message: `Panel XML ile güncellendi; Trendyol senkronu bekleniyor · storeId=${params.storeId} · productId=${params.productId}`
    });
  }
}

/** Batch sonucu: fiyat/stok satırı başarılı (TrendyolBatchResultSync’ten). */
export async function markProductMarketplaceSyncedFromBatch(params: {
  productId: string;
  storeId: string;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  await prisma.product.updateMany({
    where: { id: params.productId, storeId: params.storeId },
    data: {
      marketplaceSyncStatus: STATUS.SYNCED,
      lastMarketplaceSyncAt: now,
      marketplaceSyncError: null
    }
  });
}
