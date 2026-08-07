/**
 * Hepsiburada MPOP Katalog Ürün Entegrasyonu.
 *
 * Doğrulama durumu (developers.hepsiburada.com, 05.06.2026 / bu görev):
 *  TAM: get-all-categories, category attributes, attribute values,
 *       products/import, products/status/{trackingId}, trackingId-history,
 *       products-by-merchant-and-status, delete-process/{trackingId} (sorgu).
 *  PLACEHOLDER: all-products-of-merchant, approve/reject-prematch,
 *       delete-process (başlat), fastlisting, check-product-status.
 *
 * Auth: HTTP Basic (varsayılan). JWT catalog-bearer kullanılmaz.
 * Rate limit notu: ~180 istek/dakika/IP (Giriş Önemli Bilgiler).
 *
 * Listing endpoint'leri (LISTING base, Basic) bu dosyada korunur — OMS/Claims değil.
 */

import {
  hbFetch,
  hbPostFormData,
  hbPutJson,
  getHbMerchantId,
  type HbFetchResult,
} from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";
import {
  normalizeHbMerchantSku,
  type HbProductStatus,
} from "@/lib/hepsiburadaProductFormat";

export {
  formatHbPrice,
  normalizeHbMerchantSku,
  HB_PRODUCT_STATUS_LABELS_TR,
  type HbProductStatus,
} from "@/lib/hepsiburadaProductFormat";

// ─── Genel zarf ──────────────────────────────────────────────────────────────

export type HbApiEnvelope<T> = {
  success?: boolean;
  code?: number | string;
  version?: number | string;
  message?: string;
  totalElements?: number;
  totalPages?: number;
  number?: number;
  numberOfElements?: number;
  first?: boolean;
  last?: boolean;
  data?: T;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function envelopeDataArray(d: unknown): unknown[] {
  if (Array.isArray(d)) return d;
  const r = asRecord(d);
  if (!r) return [];
  if (Array.isArray(r.data)) return r.data;
  return [];
}

// ─── Kategori tipleri (2.x) ──────────────────────────────────────────────────

export type HbCategoryRaw = {
  categoryId: number;
  name: string;
  parentCategoryId: number;
  paths: string;
  leaf: boolean;
  status: string;
  available: boolean;
};

/** Geriye dönük sync/UI uyumu */
export type HbCategory = {
  id: number | string;
  name: string;
  parentId?: number | string | null;
  hasChildren?: boolean;
  leaf?: boolean;
  paths?: string;
  status?: string;
  available?: boolean;
};

export type HbAttributeRaw = {
  name: string;
  id: string;
  mandatory: boolean;
  type: "String" | "Enum" | string;
  multiValue: boolean;
};

export type HbAttribute = {
  id: number | string;
  name: string;
  required: boolean;
  type: string;
  multiValue?: boolean;
  values?: Array<{ id: number | string; name: string }>;
};

export type HbAttributeValue = {
  id: number | string;
  name: string;
};

export type HbBrand = {
  id: number | string;
  name: string;
};

// ─── 2.1 GET get-all-categories ──────────────────────────────────────────────

export async function hbGetAllCategories(
  storeId: string,
  options?: {
    leaf?: boolean;
    status?: "ACTIVE" | "PASSIVE";
    available?: boolean;
    page?: number;
    size?: number;
  }
): Promise<HbFetchResult<HbApiEnvelope<HbCategoryRaw[]>>> {
  const size = Math.min(options?.size ?? 2000, 2000);
  const qs = new URLSearchParams({
    leaf: String(options?.leaf ?? true),
    status: options?.status ?? "ACTIVE",
    available: String(options?.available ?? true),
    page: String(options?.page ?? 0),
    size: String(size),
    version: "1",
    type: "HX",
  });

  return hbFetch<HbApiEnvelope<HbCategoryRaw[]>>(
    storeId,
    "MPOP",
    `/product/api/categories/get-all-categories?${qs.toString()}`
  );
}

/** Sync uyumu — HbCategory[] döner */
export async function fetchHbCategories(
  storeId: string,
  options?: { leaf?: boolean; status?: "ACTIVE" | "PASSIVE"; available?: boolean; page?: number; size?: number }
): Promise<{ ok: true; categories: HbCategory[] } | { ok: false; message: string }> {
  const res = await hbGetAllCategories(storeId, options);
  if (!res.ok) return { ok: false, message: res.message };

  const list = envelopeDataArray(res.data);
  const categories: HbCategory[] = list.map((c) => {
    const o = asRecord(c) ?? {};
    const categoryId = o.categoryId ?? o.id;
    const parent = o.parentCategoryId ?? o.parentId ?? null;
    return {
      id: categoryId as number | string,
      name: String(o.name ?? ""),
      parentId: parent as number | string | null,
      leaf: Boolean(o.leaf),
      hasChildren: o.leaf === false,
      paths: typeof o.paths === "string" ? o.paths : undefined,
      status: typeof o.status === "string" ? o.status : undefined,
      available: typeof o.available === "boolean" ? o.available : undefined,
    };
  });

  return { ok: true, categories };
}

// ─── 2.2 GET categories/{id}/attributes ──────────────────────────────────────

export async function hbGetCategoryAttributes(
  storeId: string,
  categoryId: number | string
): Promise<HbFetchResult<HbApiEnvelope<HbAttributeRaw[]>>> {
  return hbFetch<HbApiEnvelope<HbAttributeRaw[]>>(
    storeId,
    "MPOP",
    `/product/api/categories/${encodeURIComponent(String(categoryId))}/attributes`
  );
}

export async function fetchHbCategoryAttributes(
  storeId: string,
  categoryId: number | string
): Promise<{ ok: true; attributes: HbAttribute[] } | { ok: false; message: string }> {
  const res = await hbGetCategoryAttributes(storeId, categoryId);
  if (!res.ok) return { ok: false, message: res.message };

  const list = envelopeDataArray(res.data);
  const attributes: HbAttribute[] = list.map((a) => {
    const o = asRecord(a) ?? {};
    return {
      id: (o.id ?? o.attributeId) as string | number,
      name: String(o.name ?? o.attributeName ?? ""),
      required: Boolean(o.mandatory ?? o.required ?? o.isMandatory),
      type: String(o.type ?? "String"),
      multiValue: Boolean(o.multiValue),
    };
  });

  return { ok: true, attributes };
}

// ─── 2.3 GET attribute values ────────────────────────────────────────────────

export async function hbGetAttributeValues(
  storeId: string,
  categoryId: number | string,
  attributeId: number | string,
  options?: { page?: number; size?: number }
): Promise<
  HbFetchResult<{
    envelope: HbApiEnvelope<Array<{ id: string; value: string }>>;
    totalCount?: number;
  }>
> {
  const size = Math.min(options?.size ?? 1000, 1000);
  const qs = new URLSearchParams({
    page: String(options?.page ?? 0),
    size: String(size),
  });
  const path =
    `/product/api/categories/${encodeURIComponent(String(categoryId))}` +
    `/attribute/${encodeURIComponent(String(attributeId))}/values?${qs.toString()}`;

  const res = await hbFetch<HbApiEnvelope<Array<{ id: string; value: string }>>>(
    storeId,
    "MPOP",
    path,
    { includeHeaders: true }
  );
  if (!res.ok) return res;

  // Total count header adı dokümanda yok — adayları dene, yoksa undefined.
  let totalCount: number | undefined;
  if (res.headers) {
    const candidates = [
      "x-total-count",
      "X-Total-Count",
      "total-count",
      "Total-Count",
    ];
    for (const h of candidates) {
      const v = res.headers.get(h);
      if (v != null && v.trim() !== "" && !Number.isNaN(Number(v))) {
        totalCount = Number(v);
        break;
      }
    }
    logger.info("hb_attribute_values_headers", {
      categoryId: String(categoryId),
      attributeId: String(attributeId),
      headerKeys: Array.from(res.headers.keys()).slice(0, 40),
      totalCount,
    });
  }

  return {
    ok: true,
    status: res.status,
    data: { envelope: res.data, totalCount },
  };
}

export async function fetchHbAttributeValues(
  storeId: string,
  categoryId: number | string,
  attributeId: number | string
): Promise<{ ok: true; values: HbAttributeValue[]; totalCount?: number } | { ok: false; message: string }> {
  const res = await hbGetAttributeValues(storeId, categoryId, attributeId);
  if (!res.ok) return { ok: false, message: res.message };

  const list = envelopeDataArray(res.data.envelope);
  const values: HbAttributeValue[] = list.map((v) => {
    const o = asRecord(v) ?? {};
    return {
      id: o.id as string | number,
      name: String(o.value ?? o.name ?? ""),
    };
  });

  return { ok: true, values, totalCount: res.data.totalCount };
}

// ─── Marka arama (path tam doğrulanmadı — mevcut davranış korunur, Basic) ────

export async function searchHbBrands(
  storeId: string,
  name: string
): Promise<{ ok: true; brands: HbBrand[] } | { ok: false; message: string }> {
  // Path resmi katalog referansında bu görevde teyit edilmedi; mevcut çağrı
  // Basic Auth ile sürdürülür. Boş/başarısız sonuç üst katmana iletilir.
  const qs = new URLSearchParams({ name });
  const res = await hbFetch<unknown>(
    storeId,
    "MPOP",
    `/product/api/brands?${qs.toString()}`
  );

  if (!res.ok) return { ok: false, message: res.message };

  const list = envelopeDataArray(res.data);
  const brands: HbBrand[] = list.map((b) => {
    const o = asRecord(b) ?? {};
    return { id: o.id as string | number, name: String(o.name ?? "") };
  });

  return { ok: true, brands };
}

// ─── 3.1 Import ──────────────────────────────────────────────────────────────

export type HbProductImportItem = {
  categoryId: number;
  merchant: string;
  attributes: Record<string, string | string[]>;
  merchantSku: string;
  VaryantGroupID: string;
  UrunAdi: string;
  UrunAciklamasi: string;
  Barcode: string;
  Marka: string;
  GarantiSuresi?: number;
  kg?: string;
  price?: string;
  stock?: string;
  Image1?: string;
  Image2?: string;
  Image3?: string;
  Image4?: string;
  Image5?: string;
  Video1?: string;
  [attributeKey: `attribute-${string}`]: string | undefined;
};

export type HbImportResponse = HbApiEnvelope<{ trackingId: string }>;

export async function importHbProducts(
  storeId: string,
  items: HbProductImportItem[]
): Promise<HbFetchResult<HbImportResponse>> {
  if (!items.length) {
    return { ok: false, status: 400, message: "En az bir ürün gerekli." };
  }

  let normalized: HbProductImportItem[];
  try {
    normalized = items.map((item) => ({
      ...item,
      merchantSku: normalizeHbMerchantSku(item.merchantSku),
    }));
  } catch (e) {
    return {
      ok: false,
      status: 400,
      message: e instanceof Error ? e.message : "merchantSku geçersiz.",
    };
  }

  const json = JSON.stringify(normalized);
  const blob = new Blob([json], { type: "application/json" });
  const form = new FormData();
  form.append("file", blob, "products.json");

  const res = await hbPostFormData<HbImportResponse>(
    storeId,
    "MPOP",
    "/product/api/products/import",
    form
  );

  if (res.ok) {
    logger.info("hb_product_import_accepted", {
      storeId,
      trackingId: res.data?.data?.trackingId,
      count: normalized.length,
    });
  }

  return res;
}

// ─── 3.2 Status by trackingId ────────────────────────────────────────────────

export type HbProductStatusItem = {
  itemOrderID: number;
  merchant: string;
  merchantSku: string;
  productStatus: string;
  taskDetails?: { reason: string; url: string }[];
  validationResults?: { attributeName: string; message: string }[];
  importStatus: "PROCESSING" | "SUCCESS" | "FAILED" | string;
  importMessages?: {
    severity: "INFORMATION" | "WARNING" | "ERROR" | string;
    message: string;
  }[];
  hbSku: string;
  productName: string;
};

export async function getHbProductStatus(
  storeId: string,
  trackingId: string,
  options?: { page?: number; size?: number }
): Promise<HbFetchResult<HbApiEnvelope<HbProductStatusItem[]>>> {
  const qs = new URLSearchParams({
    page: String(options?.page ?? 0),
    size: String(options?.size ?? 5),
    version: "1",
  });
  return hbFetch<HbApiEnvelope<HbProductStatusItem[]>>(
    storeId,
    "MPOP",
    `/product/api/products/status/${encodeURIComponent(trackingId)}?${qs.toString()}`
  );
}

/** @deprecated İsim: getHbProductStatus kullanın */
export async function pollHbImportStatus(
  storeId: string,
  trackingId: string,
  options?: { page?: number; size?: number }
): Promise<{ ok: true; result: HbProductStatusItem[] } | { ok: false; message: string }> {
  const res = await getHbProductStatus(storeId, trackingId, options);
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, result: envelopeDataArray(res.data) as HbProductStatusItem[] };
}

export async function waitForHbImport(
  storeId: string,
  trackingId: string,
  options?: { maxWaitMs?: number; pollIntervalMs?: number }
): Promise<{ ok: true; result: HbProductStatusItem[] } | { ok: false; message: string }> {
  const maxWait = options?.maxWaitMs ?? 5 * 60_000;
  const interval = options?.pollIntervalMs ?? 10_000;
  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    const poll = await pollHbImportStatus(storeId, trackingId);
    if (!poll.ok) return poll;

    const allDone = poll.result.every(
      (r) => r.importStatus === "SUCCESS" || r.importStatus === "FAILED"
    );
    if (allDone || poll.result.length === 0) {
      return { ok: true, result: poll.result };
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  return { ok: false, message: "Import timeout: 5 dakika içinde tamamlanmadı." };
}

// ─── 3.3 trackingId-history ──────────────────────────────────────────────────

export type HbTrackingHistoryItem = {
  createdDate: string;
  trackingId: string;
};

export async function getHbTrackingIdHistory(
  storeId: string,
  options?: { page?: number; size?: number; sort?: string }
): Promise<HbFetchResult<HbApiEnvelope<HbTrackingHistoryItem[]>>> {
  const qs = new URLSearchParams();
  if (options?.page != null) qs.set("page", String(options.page));
  if (options?.size != null) qs.set("size", String(options.size));
  if (options?.sort) qs.set("sort", options.sort);
  const q = qs.toString();
  return hbFetch<HbApiEnvelope<HbTrackingHistoryItem[]>>(
    storeId,
    "MPOP",
    `/product/api/products/trackingId-history${q ? `?${q}` : ""}`
  );
}

// ─── 3.4 products-by-merchant-and-status ─────────────────────────────────────

export async function getHbProductsByMerchantAndStatus(
  storeId: string,
  params: {
    status: HbProductStatus | string;
    taskStatus?: boolean;
    page?: number;
    size?: number;
    merchant?: string;
  }
): Promise<HbFetchResult<HbApiEnvelope<unknown[]>>> {
  const merchant =
    params.merchant?.trim() || (await getHbMerchantId(storeId));
  const size = Math.min(params.size ?? 50, 100);
  const qs = new URLSearchParams({
    merchant,
    status: params.status,
    taskStatus: String(params.taskStatus ?? false),
    page: String(params.page ?? 0),
    size: String(size),
  });

  return hbFetch<HbApiEnvelope<unknown[]>>(
    storeId,
    "MPOP",
    `/product/api/products/products-by-merchant-and-status?${qs.toString()}`
  );
}

// ─── 3.5 PLACEHOLDER — all-products-of-merchant ──────────────────────────────

export async function getHbAllProductsOfMerchant(
  _storeId: string,
  _merchantId: string
): Promise<HbFetchResult<unknown>> {
  throw new Error(
    "HB_UNVERIFIED: all-products-of-merchant response şeması doğrulanamadı — " +
      "developers.hepsiburada.com'daki 'Mağaza Bazlı Ürün Bilgisi Listeleme' " +
      "referans sayfasının tam JSON örneği alınmadan implemente edilmedi."
  );
}

// ─── 3.6 PLACEHOLDER — approve-prematch ──────────────────────────────────────

export async function approveHbPrematch(
  _storeId: string,
  _body: unknown
): Promise<HbFetchResult<unknown>> {
  throw new Error(
    "HB_UNVERIFIED: approve-prematch request body şeması doğrulanamadı."
  );
}

// ─── 3.7 PLACEHOLDER — reject-prematch ───────────────────────────────────────

export async function rejectHbPrematch(
  _storeId: string,
  _body: unknown
): Promise<HbFetchResult<unknown>> {
  throw new Error(
    "HB_UNVERIFIED: reject-prematch request body şeması doğrulanamadı " +
      "(red gerekçesi alanları teyitsiz)."
  );
}

// ─── 3.8 PLACEHOLDER — delete-process (başlat) ───────────────────────────────
/**
 * Aksiyon Bekleyen Ürün Silme.
 * Not (guide): yaratıldı / satışa hazır durumdaki ürünler silinemez.
 * Kimlik alanı (trackingId / hbSku / merchantSku) doğrulanmadı.
 */
export async function startHbDeleteProcess(
  _storeId: string,
  _body: unknown
): Promise<HbFetchResult<unknown>> {
  throw new Error(
    "HB_UNVERIFIED: delete-process request body / kimlik alanı doğrulanamadı."
  );
}

// ─── 3.9 GET delete-process/{trackingId} ─────────────────────────────────────

export async function checkHbDeleteProcessStatus(
  storeId: string,
  trackingId: string
): Promise<HbFetchResult<HbApiEnvelope<unknown>>> {
  return hbFetch<HbApiEnvelope<unknown>>(
    storeId,
    "MPOP",
    `/product/api/products/delete-process/${encodeURIComponent(trackingId)}`
  );
}

// ─── 3.10 PLACEHOLDER — fastlisting ──────────────────────────────────────────

export async function importHbFastListing(
  _storeId: string,
  _body: unknown
): Promise<HbFetchResult<unknown>> {
  throw new Error(
    "HB_UNVERIFIED: fastlisting endpoint'i için doküman içeriği hiç " +
      "okunmadı — path dışında bilgi yok."
  );
}

// ─── 3.11 PLACEHOLDER — check-product-status ─────────────────────────────────
/**
 * Path: POST /product/api/products/check-product-status
 * UYARI: Guide'daki "Ürün Durumu Sorgulama" (GET status/{trackingId}, 3.2)
 * ile aynı işlev mi yoksa farklı bir kontrol mü olduğu BELİRSİZ.
 * Ayrı fonksiyon olarak bırakıldı; gövde doğrulanana kadar çağrılmamalı.
 */
export async function checkHbProductStatusPost(
  _storeId: string,
  _body: unknown
): Promise<HbFetchResult<unknown>> {
  throw new Error(
    "HB_UNVERIFIED: check-product-status (POST) ile status/{trackingId} (GET) " +
      "çakışma şüphesi — request/response şeması doğrulanamadı."
  );
}

// ─── Listing (Basic Auth — Listeleme Entegrasyonu; katalog dışı ama mevcut) ──

export async function fetchHbListings(
  storeId: string,
  options?: { offset?: number; limit?: number }
): Promise<{ ok: true; listings: unknown[]; totalCount: number } | { ok: false; message: string }> {
  const merchantId = await getHbMerchantId(storeId);
  const qs = new URLSearchParams({
    offset: String(options?.offset ?? 0),
    limit: String(options?.limit ?? 50),
  });
  const path = `/listings/merchantid/${encodeURIComponent(merchantId)}?${qs.toString()}`;

  const res = await hbFetch<unknown>(storeId, "LISTING", path);
  if (!res.ok) return { ok: false, message: res.message };

  const d = asRecord(res.data) ?? {};
  const listings = Array.isArray(d.listings)
    ? d.listings
    : Array.isArray(d.data)
      ? (d.data as unknown[])
      : Array.isArray(res.data)
        ? (res.data as unknown[])
        : [];
  const totalCount =
    typeof d.totalCount === "number" ? d.totalCount : listings.length;

  return { ok: true, listings, totalCount };
}

export async function updateHbListing(
  storeId: string,
  merchantSku: string,
  update: { price?: number; availableStock?: number; dispatchTime?: number }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const merchantId = await getHbMerchantId(storeId);
  const path = `/listings/merchantid/${encodeURIComponent(merchantId)}/sku/${encodeURIComponent(merchantSku)}`;

  const res = await hbPutJson(storeId, "LISTING", path, update);
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}
