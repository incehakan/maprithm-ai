import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { asRecord } from "@/lib/trendyolOrderNormalize";
import {
  TRENDYOL_ORDER_INGEST_SOURCE,
  upsertTrendyolShipmentPackageForStore
} from "@/lib/trendyolOrderIngestFromPackage";
import {
  fetchTrendyolShipmentPackages,
  type TrendyolOrdersPageResponse
} from "@/lib/trendyolShipmentPackages";

const MS_DAY = 86_400_000;
const SYNC_RANGE_DAYS = 30;
/** Trendyol dokümantasyonu tek istekte max ~14 gün; pencere böl. */
const WINDOW_DAYS = 14;
const MAX_PAGES_PER_WINDOW = 200;

function extractPageContent(data: TrendyolOrdersPageResponse): unknown[] {
  const top = Array.isArray(data.content) ? data.content : null;
  if (top) return top;
  const nested = data.data;
  if (nested && Array.isArray(nested.content)) return nested.content;
  return [];
}

function extractTotalPages(data: TrendyolOrdersPageResponse): number {
  const p = data.totalPages ?? data.data?.totalPages;
  if (typeof p === "number" && p >= 1) return p;
  return 1;
}

async function fetchAllPackagesInWindow(params: {
  userId: string;
  storeId: string;
  startDate: number;
  endDate: number;
  status?: string;
}): Promise<unknown[]> {
  const out: unknown[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages && page < MAX_PAGES_PER_WINDOW) {
    const res = await fetchTrendyolShipmentPackages(params.userId, params.storeId, {
      startDate: params.startDate,
      endDate: params.endDate,
      status: params.status,
      page,
      size: 50
    });
    if (!res.ok) {
      throw new Error(res.message);
    }
    const data = res.data;
    const chunk = extractPageContent(data);
    if (chunk.length === 0) break;
    out.push(...chunk);
    totalPages = extractTotalPages(data);
    page += 1;
  }
  return out;
}

export type SyncTrendyolOrdersResult = {
  upsertedPackages: number;
};

export async function syncTrendyolOrdersForStore(params: {
  userId: string;
  storeId: string;
  membershipId: string;
  status?: string;
}): Promise<SyncTrendyolOrdersResult> {
  const { userId, storeId, membershipId, status } = params;
  const now = Date.now();
  const start30 = now - SYNC_RANGE_DAYS * MS_DAY;

  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TRENDYOL_ORDER_SYNC_STARTED",
    entityType: "marketplace_order",
    message: `Trendyol sipariş senkronu başladı (son ${SYNC_RANGE_DAYS} gün)${status ? `, durum: ${status}` : ""}.`
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: null,
      action: "TRENDYOL_ORDER_SYNC_STARTED",
      message: `Son ${SYNC_RANGE_DAYS} gün, status=${status ?? "tümü"}`
    }
  });

  let upserted = 0;

  let windowEnd = now;
  while (windowEnd > start30) {
    const windowStart = Math.max(start30, windowEnd - WINDOW_DAYS * MS_DAY);
    const packages = await fetchAllPackagesInWindow({
      userId,
      storeId,
      startDate: windowStart,
      endDate: windowEnd,
      status
    });

    for (const item of packages) {
      const raw = asRecord(item);
      if (!raw) continue;

      await upsertTrendyolShipmentPackageForStore(prisma, {
        storeId,
        raw,
        ingestSource: TRENDYOL_ORDER_INGEST_SOURCE.MANUAL_SYNC
      });
      upserted += 1;
    }

    windowEnd = windowStart - 1;
  }

  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TRENDYOL_ORDER_SYNC_COMPLETED",
    entityType: "marketplace_order",
    message: `Trendyol sipariş senkronu tamamlandı. İşlenen paket: ${upserted}.`
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: null,
      action: "TRENDYOL_ORDER_SYNC_COMPLETED",
      message: `Paket sayısı: ${upserted}`
    }
  });

  return { upsertedPackages: upserted };
}
