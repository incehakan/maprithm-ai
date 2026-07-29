import { prisma } from "@/lib/prisma";
import { trendyolFetch, type TrendyolFetchResult } from "@/lib/trendyolFetch";

export type TrendyolOrdersPageResponse = {
  content?: unknown[];
  totalPages?: number;
  totalElements?: number;
  page?: number;
  size?: number;
  data?: { content?: unknown[]; totalPages?: number; page?: number };
};

/** Trendyol getShipmentPackages için zorunlu header (TR için genelde "TR"). */
export function getTrendyolStorefrontCode(): string {
  return process.env.TRENDYOL_STOREFRONT_CODE?.trim() || "TR";
}

export type FetchTrendyolShipmentPackagesParams = {
  status?: string;
  startDate?: number;
  endDate?: number;
  lastModifiedStartDate?: number;
  lastModifiedEndDate?: number;
  page?: number;
  size?: number;
  orderNumber?: string;
  orderByField?: string;
  orderByDirection?: "ASC" | "DESC";
};

function buildOrdersPath(
  sellerId: string,
  params: FetchTrendyolShipmentPackagesParams
): string {
  const qs = new URLSearchParams();
  if (params.startDate != null) qs.set("startDate", String(params.startDate));
  if (params.endDate != null) qs.set("endDate", String(params.endDate));
  if (params.lastModifiedStartDate != null) {
    qs.set("lastModifiedStartDate", String(params.lastModifiedStartDate));
  }
  if (params.lastModifiedEndDate != null) {
    qs.set("lastModifiedEndDate", String(params.lastModifiedEndDate));
  }
  if (params.status?.trim()) qs.set("status", params.status.trim());
  if (params.orderNumber?.trim()) qs.set("orderNumber", params.orderNumber.trim());
  qs.set("supplierId", sellerId);
  qs.set("orderByField", params.orderByField ?? "PackageLastModifiedDate");
  qs.set("orderByDirection", params.orderByDirection ?? "DESC");
  qs.set("size", String(params.size ?? 50));
  qs.set("page", String(params.page ?? 0));
  const q = qs.toString();
  return `/integration/order/sellers/${encodeURIComponent(sellerId)}/orders${q ? `?${q}` : ""}`;
}

/**
 * Trendyol getShipmentPackages (sellers/{sellerId}/orders).
 * storeId + platform ile MarketplaceConnection bulunur.
 */
export async function fetchTrendyolShipmentPackages(
  _userId: string,
  storeId: string,
  params: FetchTrendyolShipmentPackagesParams
): Promise<TrendyolFetchResult<TrendyolOrdersPageResponse>> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { sellerId: true, userId: true }
  });
  if (!conn?.sellerId?.trim() || !conn.userId) {
    return {
      ok: false,
      status: 0,
      message: "Trendyol bağlantısı veya sellerId bulunamadı."
    };
  }

  const path = buildOrdersPath(conn.sellerId.trim(), params);
  return trendyolFetch<TrendyolOrdersPageResponse>(conn.userId, storeId, path, {
    extraHeaders: { storeFrontCode: getTrendyolStorefrontCode() }
  });
}

// ─── getShipmentPackagesStream (cursor tabanlı, yüksek hacim için) ─────────────
// Trendyol uyarısı: getShipmentPackages yakında 10.000 kayıtla sınırlandırılacak.
// Periyodik tam tarama job'ları için bu stream endpoint'i kullanılmalı.
// ORDER_STREAM feature flag'i açık mağazalarda aktif olur.

export type TrendyolOrdersStreamResponse = {
  content?: unknown[];
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type FetchTrendyolShipmentPackagesStreamParams = {
  status?: string;
  startDate?: number;
  endDate?: number;
  lastModifiedStartDate?: number;
  lastModifiedEndDate?: number;
  size?: number;
  cursor?: string;
};

function buildOrdersStreamPath(
  sellerId: string,
  params: FetchTrendyolShipmentPackagesStreamParams
): string {
  const qs = new URLSearchParams();
  if (params.startDate != null) qs.set("startDate", String(params.startDate));
  if (params.endDate != null) qs.set("endDate", String(params.endDate));
  if (params.lastModifiedStartDate != null) {
    qs.set("lastModifiedStartDate", String(params.lastModifiedStartDate));
  }
  if (params.lastModifiedEndDate != null) {
    qs.set("lastModifiedEndDate", String(params.lastModifiedEndDate));
  }
  if (params.status?.trim()) qs.set("status", params.status.trim());
  if (params.cursor?.trim()) qs.set("cursor", params.cursor.trim());
  qs.set("supplierId", sellerId);
  qs.set("size", String(params.size ?? 200));
  const q = qs.toString();
  return `/integration/order/sellers/${encodeURIComponent(sellerId)}/orders/stream${q ? `?${q}` : ""}`;
}

/**
 * Trendyol getShipmentPackagesStream — cursor tabanlı yüksek hacim senkronu.
 * ORDER_STREAM feature flag'i açık mağazalarda fetchTrendyolShipmentPackages
 * yerine bu kullanılmalı (özellikle background sync job'larında).
 *
 * Kullanım:
 *   let cursor: string | undefined;
 *   do {
 *     const res = await fetchTrendyolShipmentPackagesStream(userId, storeId, { cursor });
 *     if (!res.ok) break;
 *     processBatch(res.data.content);
 *     cursor = res.data.nextCursor ?? undefined;
 *   } while (res.data.hasMore && cursor);
 */
export async function fetchTrendyolShipmentPackagesStream(
  _userId: string,
  storeId: string,
  params: FetchTrendyolShipmentPackagesStreamParams
): Promise<TrendyolFetchResult<TrendyolOrdersStreamResponse>> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { sellerId: true, userId: true }
  });
  if (!conn?.sellerId?.trim() || !conn.userId) {
    return {
      ok: false,
      status: 0,
      message: "Trendyol bağlantısı veya sellerId bulunamadı."
    };
  }

  // Trendyol minimum 5 saniye istek aralığı öneriyor; bu fonksiyon bunu zorunlu kılmaz,
  // çağıran tarafın (background sync job) rate limit yönetmesi gerekir.
  const path = buildOrdersStreamPath(conn.sellerId.trim(), params);
  return trendyolFetch<TrendyolOrdersStreamResponse>(conn.userId, storeId, path, {
    extraHeaders: { storeFrontCode: getTrendyolStorefrontCode() }
  });
}
