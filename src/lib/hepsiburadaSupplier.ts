/**
 * Hepsiburada Tedarikçi Entegrasyonu (SUPPLIER base).
 *
 * Envanter (listingUpdateRequests / supplierlistings) + Satın Alma
 * (openPurchaseOrders).
 *
 * SIT listesiyle doğrulandı (03.08.2026).
 * Prod domain TAHMİNİ (`SUPPLIER`).
 *
 * `/search` endpoint'leri: POST + body (OpenAPI / Lonca: teklif-oluşturma,
 * açık-siparişleri-listeleme, envanter-bilgilerini-listeleme).
 * Resmi dokümantasyondan doğrulandı (2026-08-03) — method POST;
 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.
 * Savunma: 405 alınırsa GET+query fallback denenir.
 */

import { getHbMerchantId, hbFetch, hbPostJson } from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

type HbSimpleResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

type HbItemsResult =
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

/**
 * Method: GET
 * Path: /suppliers/{merchantId}/listingUpdateRequests
 * SIT listesiyle doğrulandı (03.08.2026).
 */
export async function fetchHbListingUpdateRequests(params: {
  storeId: string;
  query?: Record<string, string>;
}): Promise<HbItemsResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    const qs = new URLSearchParams(params.query ?? {});
    const q = qs.toString();
    const path = `/suppliers/${encodeURIComponent(merchantId)}/listingUpdateRequests${q ? `?${q}` : ""}`;
    const res = await hbFetch(params.storeId, "SUPPLIER", path);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, items: extractItems(res.data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "listingUpdateRequests list hatası.";
    logger.error("hb_listing_update_requests_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: POST
 * Path: /suppliers/{merchantId}/listingUpdateRequests
 * SIT listesiyle doğrulandı (03.08.2026).
 * Body şeması TODO: teyit edilmeli.
 */
export async function createHbListingUpdateRequest(params: {
  storeId: string;
  payload: Record<string, unknown>;
}): Promise<HbSimpleResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/suppliers/${encodeURIComponent(merchantId)}/listingUpdateRequests`;
    const res = await hbPostJson(params.storeId, "SUPPLIER", path, params.payload);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "listingUpdateRequest create hatası.";
    logger.error("hb_create_listing_update_request_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: POST
 * Path: /suppliers/{merchantId}/listingUpdateRequests/search
 * Body: filtre + sayfalama (örn. pageNumber, pageSize) — alan seti dokümana bağlı.
 *
 * Resmi dokümantasyondan doğrulandı (2026-08-03) — method POST;
 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.
 */
export async function searchHbListingUpdateRequests(params: {
  storeId: string;
  filter?: Record<string, unknown>;
}): Promise<HbItemsResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/suppliers/${encodeURIComponent(merchantId)}/listingUpdateRequests/search`;
    const res = await hbPostJson(
      params.storeId,
      "SUPPLIER",
      path,
      params.filter ?? {}
    );
    if (!res.ok) {
      if (res.status === 405) {
        logger.warn("hb_listing_update_search_405", {
          note: "POST 405 — GET+query deneniyor.",
        });
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params.filter ?? {})) {
          if (v != null) qs.set(k, String(v));
        }
        const q = qs.toString();
        const getRes = await hbFetch(
          params.storeId,
          "SUPPLIER",
          `${path}${q ? `?${q}` : ""}`
        );
        if (!getRes.ok) return { ok: false, message: getRes.message };
        return { ok: true, items: extractItems(getRes.data) };
      }
      return { ok: false, message: res.message };
    }
    return { ok: true, items: extractItems(res.data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "listingUpdateRequests search hatası.";
    logger.error("hb_search_listing_update_requests_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: GET
 * Path: /suppliers/{merchantId}/listingUpdateRequests/{requestId}
 * SIT listesiyle doğrulandı (03.08.2026).
 */
export async function fetchHbListingUpdateRequestById(params: {
  storeId: string;
  requestId: string;
}): Promise<HbSimpleResult> {
  try {
    const requestId = params.requestId.trim();
    if (!requestId) return { ok: false, message: "requestId zorunludur." };
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/suppliers/${encodeURIComponent(merchantId)}/listingUpdateRequests/${encodeURIComponent(requestId)}`;
    const res = await hbFetch(params.storeId, "SUPPLIER", path);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "listingUpdateRequest by id hatası.";
    logger.error("hb_listing_update_request_by_id_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: POST
 * Path: /suppliers/{merchantId}/supplierlistings/search
 *
 * Resmi dokümantasyondan doğrulandı (2026-08-03) — method POST;
 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.
 */
export async function searchHbSupplierListings(params: {
  storeId: string;
  filter?: Record<string, unknown>;
}): Promise<HbItemsResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/suppliers/${encodeURIComponent(merchantId)}/supplierlistings/search`;
    const res = await hbPostJson(
      params.storeId,
      "SUPPLIER",
      path,
      params.filter ?? {}
    );
    if (!res.ok) {
      if (res.status === 405) {
        logger.warn("hb_supplier_listings_search_405", {
          note: "POST 405 — GET+query deneniyor.",
        });
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params.filter ?? {})) {
          if (v != null) qs.set(k, String(v));
        }
        const q = qs.toString();
        const getRes = await hbFetch(
          params.storeId,
          "SUPPLIER",
          `${path}${q ? `?${q}` : ""}`
        );
        if (!getRes.ok) return { ok: false, message: getRes.message };
        return { ok: true, items: extractItems(getRes.data) };
      }
      return { ok: false, message: res.message };
    }
    return { ok: true, items: extractItems(res.data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "supplierlistings search hatası.";
    logger.error("hb_search_supplier_listings_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: POST
 * Path: /suppliers/{merchantId}/openPurchaseOrders/search
 * Satın alma süreci.
 *
 * Resmi dokümantasyondan doğrulandı (2026-08-03) — method POST;
 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.
 */
export async function searchHbOpenPurchaseOrders(params: {
  storeId: string;
  filter?: Record<string, unknown>;
}): Promise<HbItemsResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/suppliers/${encodeURIComponent(merchantId)}/openPurchaseOrders/search`;
    const res = await hbPostJson(
      params.storeId,
      "SUPPLIER",
      path,
      params.filter ?? {}
    );
    if (!res.ok) {
      if (res.status === 405) {
        logger.warn("hb_open_po_search_405", {
          note: "POST 405 — GET+query deneniyor.",
        });
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params.filter ?? {})) {
          if (v != null) qs.set(k, String(v));
        }
        const q = qs.toString();
        const getRes = await hbFetch(
          params.storeId,
          "SUPPLIER",
          `${path}${q ? `?${q}` : ""}`
        );
        if (!getRes.ok) return { ok: false, message: getRes.message };
        return { ok: true, items: extractItems(getRes.data) };
      }
      return { ok: false, message: res.message };
    }
    return { ok: true, items: extractItems(res.data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "openPurchaseOrders search hatası.";
    logger.error("hb_search_open_purchase_orders_failed", { message });
    return { ok: false, message };
  }
}
