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
  page?: number;
  size?: number;
  orderNumber?: string;
};

function buildOrdersPath(
  sellerId: string,
  params: FetchTrendyolShipmentPackagesParams
): string {
  const qs = new URLSearchParams();
  if (params.startDate != null) qs.set("startDate", String(params.startDate));
  if (params.endDate != null) qs.set("endDate", String(params.endDate));
  if (params.status?.trim()) qs.set("status", params.status.trim());
  if (params.orderNumber?.trim()) qs.set("orderNumber", params.orderNumber.trim());
  qs.set("supplierId", sellerId);
  qs.set("orderByField", "PackageLastModifiedDate");
  qs.set("orderByDirection", "DESC");
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
