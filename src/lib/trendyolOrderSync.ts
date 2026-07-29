import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { asRecord } from "@/lib/trendyolOrderNormalize";
import {
  TRENDYOL_ORDER_INGEST_SOURCE,
  type TrendyolOrderIngestSource,
  upsertTrendyolShipmentPackageForStore
} from "@/lib/trendyolOrderIngestFromPackage";
import {
  fetchTrendyolShipmentPackages,
  fetchTrendyolShipmentPackagesStream,
  type FetchTrendyolShipmentPackagesParams,
  type TrendyolOrdersPageResponse
} from "@/lib/trendyolShipmentPackages";
import { FEATURE_FLAGS, isFeatureEnabled } from "@/lib/featureFlags";

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

export type OrderSyncPullMode =
  | "incremental_last_modified"
  | "full_order_date_windows"
  | "reconcile_order_date";

export type RunTrendyolOrderSyncPullParams = {
  userId: string;
  storeId: string;
  membershipId: string | null;
  status?: string;
  orderByField?: string;
  orderByDirection?: "ASC" | "DESC";
  ingestSource: TrendyolOrderIngestSource;
  activityContext?: { userId: string; membershipId?: string | null };
  mode: OrderSyncPullMode;
  rangeStartMs: number;
  rangeEndMs: number;
  /** Paket bazlı hata olursa devam et (job istatistiği için) */
  continueOnPackageError?: boolean;
};

export type RunTrendyolOrderSyncPullResult = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

async function fetchAllPackagesInWindow(params: {
  userId: string;
  storeId: string;
  mode: OrderSyncPullMode;
  windowStart: number;
  windowEnd: number;
  status?: string;
  orderByField?: string;
  orderByDirection?: "ASC" | "DESC";
}): Promise<unknown[]> {
  const out: unknown[] = [];
  let page = 0;
  let totalPages = 1;
  const orderByField =
    params.orderByField ??
    (params.mode === "incremental_last_modified" ? "PackageLastModifiedDate" : "PackageLastModifiedDate");
  const orderByDirection = params.orderByDirection ?? "DESC";

  while (page < totalPages && page < MAX_PAGES_PER_WINDOW) {
    let req: FetchTrendyolShipmentPackagesParams;
    if (params.mode === "incremental_last_modified") {
      req = {
        lastModifiedStartDate: params.windowStart,
        lastModifiedEndDate: params.windowEnd,
        status: params.status,
        orderByField,
        orderByDirection,
        page,
        size: 50
      };
    } else {
      req = {
        startDate: params.windowStart,
        endDate: params.windowEnd,
        status: params.status,
        orderByField,
        orderByDirection,
        page,
        size: 50
      };
    }

    const res = await fetchTrendyolShipmentPackages(params.userId, params.storeId, req);
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

/**
 * Tek pencerede sipariş numarasına göre paket çek (reconciliation).
 */
export async function fetchTrendyolPackagesByOrderNumber(params: {
  userId: string;
  storeId: string;
  orderNumber: string;
  startDateMs: number;
  endDateMs: number;
  status?: string;
}): Promise<unknown[]> {
  const out: unknown[] = [];
  let page = 0;
  let totalPages = 1;
  while (page < totalPages && page < MAX_PAGES_PER_WINDOW) {
    const res = await fetchTrendyolShipmentPackages(params.userId, params.storeId, {
      orderNumber: params.orderNumber,
      startDate: params.startDateMs,
      endDate: params.endDateMs,
      status: params.status,
      orderByField: "PackageLastModifiedDate",
      orderByDirection: "DESC",
      page,
      size: 50
    });
    if (!res.ok) throw new Error(res.message);
    const data = res.data;
    const chunk = extractPageContent(data);
    if (chunk.length === 0) break;
    out.push(...chunk);
    totalPages = extractTotalPages(data);
    page += 1;
  }
  return out;
}

export async function runTrendyolOrderSyncPull(
  p: RunTrendyolOrderSyncPullParams
): Promise<RunTrendyolOrderSyncPullResult> {
  const result: RunTrendyolOrderSyncPullResult = {
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0
  };
  const cont = p.continueOnPackageError !== false;

  async function ingestPackages(packages: unknown[]) {
    for (const item of packages) {
      result.fetched += 1;
      const raw = asRecord(item);
      if (!raw) {
        result.skipped += 1;
        continue;
      }
      try {
        const u = await upsertTrendyolShipmentPackageForStore(prisma, {
          storeId: p.storeId,
          raw,
          ingestSource: p.ingestSource,
          activityContext: p.activityContext ?? {
            userId: p.userId,
            membershipId: p.membershipId
          }
        });
        if (u.wasNew) result.created += 1;
        else result.updated += 1;
      } catch (err) {
        result.failed += 1;
        if (!cont) throw err;
      }
    }
  }

  if (p.mode === "incremental_last_modified") {
    let windowEnd = p.rangeEndMs;
    const startFloor = p.rangeStartMs;
    while (windowEnd > startFloor) {
      const windowStart = Math.max(startFloor, windowEnd - WINDOW_DAYS * MS_DAY);
      const packages = await fetchAllPackagesInWindow({
        userId: p.userId,
        storeId: p.storeId,
        mode: p.mode,
        windowStart,
        windowEnd,
        status: p.status,
        orderByField: p.orderByField,
        orderByDirection: p.orderByDirection
      });
      await ingestPackages(packages);
      windowEnd = windowStart - 1;
    }
    return result;
  }

  /* full_order_date_windows | reconcile_order_date */
  let windowEnd = p.rangeEndMs;
  const startFloor = p.rangeStartMs;
  while (windowEnd > startFloor) {
    const windowStart = Math.max(startFloor, windowEnd - WINDOW_DAYS * MS_DAY);
    const packages = await fetchAllPackagesInWindow({
      userId: p.userId,
      storeId: p.storeId,
      mode: "full_order_date_windows",
      windowStart,
      windowEnd,
      status: p.status,
      orderByField: p.orderByField,
      orderByDirection: p.orderByDirection
    });
    await ingestPackages(packages);
    windowEnd = windowStart - 1;
  }

  return result;
}

export type SyncTrendyolOrdersResult = {
  upsertedPackages: number;
};

/**
 * @deprecated Job tabanlı senkron kullanın. Geriye dönük çağrılar için tam pencere senkronu.
 */
export async function syncTrendyolOrdersForStore(params: {
  userId: string;
  storeId: string;
  membershipId: string;
  status?: string;
  orderByField?: string;
  orderByDirection?: "ASC" | "DESC";
  updatedAfterMs?: number;
}): Promise<SyncTrendyolOrdersResult> {
  const { userId, storeId, membershipId, status } = params;
  const now = Date.now();
  const start30 = params.updatedAfterMs ?? now - SYNC_RANGE_DAYS * MS_DAY;

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
      action: "ORDER_SYNCED",
      message: `Tam senkron başladı (son ${SYNC_RANGE_DAYS} gün, status=${status ?? "tümü"})`
    }
  });

  const pull = await runTrendyolOrderSyncPull({
    userId,
    storeId,
    membershipId,
    status,
    orderByField: params.orderByField,
    orderByDirection: params.orderByDirection,
    ingestSource: TRENDYOL_ORDER_INGEST_SOURCE.MANUAL_SYNC,
    activityContext: { userId, membershipId },
    mode: "full_order_date_windows",
    rangeStartMs: start30,
    rangeEndMs: now,
    continueOnPackageError: true
  });

  const upserted = pull.created + pull.updated;

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
      action: "ORDER_SYNCED",
      message: `Senkron bitti: çekilen ${pull.fetched}, yeni ${pull.created}, güncellenen ${pull.updated}, atlanan ${pull.skipped}, hata ${pull.failed}`
    }
  });

  return { upsertedPackages: upserted };
}

/**
 * ORDER_STREAM feature flag açık mağazalar için cursor tabanlı sipariş çekme.
 * getShipmentPackages'in 10K limit sorununu aşar.
 * Periyodik background sync job'larından çağrılır.
 */
export async function fetchTrendyolOrdersViaStream(params: {
  userId: string;
  storeId: string;
  startDateMs: number;
  endDateMs: number;
  status?: string;
}): Promise<unknown[]> {
  // ORDER_STREAM flag kontrolü: kapalıysa eski yönteme fallback
  const store = await prisma.store.findUnique({
    where: { id: params.storeId },
    select: { featureFlags: true }
  });
  const streamEnabled = store ? isFeatureEnabled(store, FEATURE_FLAGS.ORDER_STREAM) : false;
  if (!streamEnabled) {
    // Flag kapalı: mevcut page-based yöntem (geriye dönük uyumluluk)
    return fetchAllPackagesInWindow({
      userId: params.userId,
      storeId: params.storeId,
      mode: "full_order_date_windows",
      windowStart: params.startDateMs,
      windowEnd: params.endDateMs,
      status: params.status,
      orderByField: "PackageLastModifiedDate",
      orderByDirection: "DESC"
    });
  }

  // FLAG AÇIK: cursor tabanlı stream
  const out: unknown[] = [];
  let cursor: string | undefined;
  let page = 0;
  const MAX_PAGES = 500; // sonsuz döngü koruması

  do {
    // Trendyol: aynı endpoint'e 10 saniyede max 50 istek (stream için 5s önerilir)
    if (page > 0) await new Promise((r) => setTimeout(r, 5_000));

    const res = await fetchTrendyolShipmentPackagesStream(
      params.userId,
      params.storeId,
      {
        startDate: params.startDateMs,
        endDate: params.endDateMs,
        status: params.status,
        cursor,
        size: 200
      }
    );

    if (!res.ok) {
      throw new Error(`Stream sipariş çekme hatası: ${res.message}`);
    }

    const content = Array.isArray(res.data.content) ? res.data.content : [];
    out.push(...content);
    cursor = res.data.nextCursor ?? undefined;
    page += 1;
  } while (cursor && page < MAX_PAGES);

  return out;
}
