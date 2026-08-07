/**
 * Hepsiburada OMS — statü bazlı (dedike path) listeleme feed'leri.
 *
 * SIT listesiyle doğrulandı (03.08.2026).
 *
 * ÇELİŞKİ / UYARI:
 * Bu dosyadaki dedike-path endpoint'ler ile `hepsiburadaOrderSync.ts`'teki
 * query-param'lı `GET /packages/merchantid/{id}/packages?status=...`
 * endpoint'i arasındaki ilişki doğrulanmadı — muhtemelen ikisi de var ama
 * hangisinin daha güncel/önerilen olduğu HB dokümantasyonundan teyit
 * edilmeli. Üretimde her iki yaklaşımı da yeniden yazan bir "birleştirme"
 * yapmadan önce canlı hesapla test edilmeli.
 *
 * Bu yüzden hepsiburadaOrderSync.ts'e DOKUNULMADI — mevcut sync akışı
 * korunuyor; bu fonksiyonlar bağımsız alternatif yüzeydir.
 *
 * Karar kaydı: docs/HEPSIBURADA_SYNC_KARAR.md (seçenek 3 — tamamlayıcı kullanım).
 */

import { getHbMerchantId, hbFetch } from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

type HbSimpleResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

type PageParams = {
  storeId: string;
  offset?: number;
  limit?: number;
};

function withPagination(path: string, params: PageParams): string {
  const qs = new URLSearchParams();
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.limit != null) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return q ? `${path}?${q}` : path;
}

async function fetchStatusFeed(
  params: PageParams,
  pathBuilder: (merchantId: string) => string,
  logKey: string
): Promise<HbSimpleResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    const path = withPagination(pathBuilder(merchantId), params);
    const res = await hbFetch(params.storeId, "OMS", path);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : `${logKey} hatası.`;
    logger.error(logKey, { message });
    return { ok: false, message };
  }
}

/** GET /orders/merchantid/{merchantId} — SIT (03.08.2026) */
export async function fetchHbOrdersAll(params: PageParams): Promise<HbSimpleResult> {
  return fetchStatusFeed(
    params,
    (m) => `/orders/merchantid/${encodeURIComponent(m)}`,
    "hb_orders_all_failed"
  );
}

/** GET /orders/merchantid/{merchantId}/cancelled — SIT (03.08.2026) */
export async function fetchHbOrdersCancelled(params: PageParams): Promise<HbSimpleResult> {
  return fetchStatusFeed(
    params,
    (m) => `/orders/merchantid/${encodeURIComponent(m)}/cancelled`,
    "hb_orders_cancelled_failed"
  );
}

/** GET /orders/merchantid/{merchantId}/paymentawaiting — SIT (03.08.2026) */
export async function fetchHbOrdersPaymentAwaiting(
  params: PageParams
): Promise<HbSimpleResult> {
  return fetchStatusFeed(
    params,
    (m) => `/orders/merchantid/${encodeURIComponent(m)}/paymentawaiting`,
    "hb_orders_paymentawaiting_failed"
  );
}

/** GET /packages/merchantid/{merchantId}/delivered — SIT (03.08.2026) */
export async function fetchHbPackagesDelivered(
  params: PageParams
): Promise<HbSimpleResult> {
  return fetchStatusFeed(
    params,
    (m) => `/packages/merchantid/${encodeURIComponent(m)}/delivered`,
    "hb_packages_delivered_failed"
  );
}

/** GET /packages/merchantid/{merchantId}/missing-invoice — SIT (03.08.2026) */
export async function fetchHbPackagesMissingInvoice(
  params: PageParams
): Promise<HbSimpleResult> {
  return fetchStatusFeed(
    params,
    (m) => `/packages/merchantid/${encodeURIComponent(m)}/missing-invoice`,
    "hb_packages_missing_invoice_failed"
  );
}

/** GET /packages/merchantid/{merchantId}/shipped — SIT (03.08.2026) */
export async function fetchHbPackagesShipped(
  params: PageParams
): Promise<HbSimpleResult> {
  return fetchStatusFeed(
    params,
    (m) => `/packages/merchantid/${encodeURIComponent(m)}/shipped`,
    "hb_packages_shipped_failed"
  );
}

/** GET /packages/merchantid/{merchantId}/status/unpacked — SIT (03.08.2026) */
export async function fetchHbPackagesUnpacked(
  params: PageParams
): Promise<HbSimpleResult> {
  return fetchStatusFeed(
    params,
    (m) => `/packages/merchantid/${encodeURIComponent(m)}/status/unpacked`,
    "hb_packages_unpacked_failed"
  );
}

/** GET /packages/merchantid/{merchantId}/undelivered — SIT (03.08.2026) */
export async function fetchHbPackagesUndelivered(
  params: PageParams
): Promise<HbSimpleResult> {
  return fetchStatusFeed(
    params,
    (m) => `/packages/merchantid/${encodeURIComponent(m)}/undelivered`,
    "hb_packages_undelivered_failed"
  );
}
