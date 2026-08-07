/**
 * Hepsiburada Muhasebe / Performans (MPFINANCE base).
 *
 * SIT listesiyle doğrulandı (03.08.2026).
 * Prod domain TAHMİNİ (`MPFINANCE`).
 *
 * TODO: Prisma'da HB'ye özel finans modeli yok (yalnızca TrendyolFinance*).
 * Bu görev yalnızca fetch — DB upsert kapsam dışı.
 */

import { getHbMerchantId, hbFetch } from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

type HbPageResult =
  | { ok: true; items: unknown[] }
  | { ok: false; message: string };

function extractItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const r = data as Record<string, unknown>;
    if (Array.isArray(r.items)) return r.items;
    if (Array.isArray(r.data)) return r.data;
    if (Array.isArray(r.content)) return r.content;
  }
  return [];
}

type FinancePageParams = {
  storeId: string;
  offset?: number;
  limit?: number;
  maxPages?: number;
  startDate?: string;
  endDate?: string;
};

async function fetchPaged(
  params: FinancePageParams,
  pathBuilder: (merchantId: string) => string,
  logKey: string
): Promise<HbPageResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    const limit = params.limit ?? 50;
    const maxPages = params.maxPages ?? 40;
    const all: unknown[] = [];
    let offset = params.offset ?? 0;
    let page = 0;

    while (page < maxPages) {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (params.startDate) qs.set("startDate", params.startDate);
      if (params.endDate) qs.set("endDate", params.endDate);

      const path = `${pathBuilder(merchantId)}?${qs.toString()}`;
      const res = await hbFetch(params.storeId, "MPFINANCE", path);
      if (!res.ok) return { ok: false, message: res.message };

      const chunk = extractItems(res.data);
      all.push(...chunk);
      if (chunk.length < limit) break;

      offset += limit;
      page += 1;
    }

    return { ok: true, items: all };
  } catch (err) {
    const message = err instanceof Error ? err.message : `${logKey} hatası.`;
    logger.error(logKey, { message });
    return { ok: false, message };
  }
}

/**
 * Method: GET
 * Path: /transactions/merchantid/{merchantId}
 * SIT listesiyle doğrulandı (03.08.2026). Base: MPFINANCE.
 * Query: offset/limit (+ opsiyonel startDate/endDate).
 */
export async function fetchHbFinanceTransactions(
  params: FinancePageParams
): Promise<HbPageResult> {
  return fetchPaged(
    params,
    (m) => `/transactions/merchantid/${encodeURIComponent(m)}`,
    "hb_finance_transactions_failed"
  );
}

/**
 * Method: GET
 * Path: /orders/merchantid/{merchantId}
 * SIT listesiyle doğrulandı (03.08.2026). Base: MPFINANCE.
 * Performans servisi — satıcı performans metriklerine giren sipariş verisi.
 */
export async function fetchHbPerformanceOrders(
  params: FinancePageParams
): Promise<HbPageResult> {
  return fetchPaged(
    params,
    (m) => `/orders/merchantid/${encodeURIComponent(m)}`,
    "hb_performance_orders_failed"
  );
}
