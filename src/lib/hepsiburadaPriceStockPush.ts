/**
 * Hepsiburada fiyat ve stok güncelleme servisi — Listeleme Entegrasyonu.
 *
 * KAYNAK: developers.hepsiburada.com resmi API referansı (2026-08-02).
 * Basic Auth (LISTING base). Accept: application/json zorunlu (hbFetch katmanı).
 *
 * Tekil güncelleme (DOĞRULANMIŞ, JSON body) — DOKUNULMADI:
 *   PUT /listings/merchantid/{merchantId}/sku/{merchantSku}
 *   Body: { availableStock, price, dispatchTime }
 *
 * Toplu inventory (DOĞRULANMIŞ):
 *   POST /listings/merchantid/{merchantId}/inventory-uploads
 *   GET  /listings/merchantid/{merchantId}/inventory-uploads/id/{id}
 *
 * price/stock/shipping/additional-info uploads: body şeması ayrıca
 * doğrulanamadı → HB_UNVERIFIED placeholder (POST). Status GET'leri
 * inventory-uploads ailesinden çıkarımla implement (okuma istisnası).
 *
 * KISIT: Aynı anda devam eden istek sayısı 5'i geçemez; tek istekte max 4000 SKU.
 * Stok/fiyat 0 → listing satışa kapanır; 0'dan farklı → satışa açılır.
 */

import {
  getHbMerchantId,
  hbFetch,
  hbPostJson,
  hbPutJson,
  type HbFetchResult,
} from "@/lib/hepsiburadaFetch";
import {
  validateHbCargoCompanies,
  type HbListingUpdateWarning,
} from "@/lib/hepsiburadaListings";
import { evaluateHbPriceRange } from "@/lib/hepsiburadaPriceRules";
import { logger } from "@/lib/logger";

// ─── Tip tanımları ───────────────────────────────────────────────────────────

export type HbPriceStockItem = {
  merchantSku: string;
  hepsiburadaSku?: string;
  price?: number;
  availableStock?: number;
  dispatchTime?: number;
};

export type HbInventoryUploadItem = {
  HepsiburadaSku?: string;
  MerchantSku?: string;
  ProductName?: string;
  Price: number;
  AvailableStock: number;
  DispatchTime: number;
  MaximumPurchasableQuantity?: number;
  CargoCompany1?: string;
  CargoCompany2?: string;
  CargoCompany3?: string;
  ShippingProfileName?: string;
  /** İstemci ön-kontrolü için opsiyonel ortalama referans fiyat */
  _referenceAveragePrice?: number;
};

export type HbInventoryUploadStatus = {
  id: string;
  status: "Done" | "Failed";
  createdAt: string;
  total: number;
  errors: null | {
    ElementNo: number;
    HepsiburadaSku?: string;
    MerchantSku?: string;
    Errors: string[]; // HbListingUpdateWarning değerleri
  }[];
  priceValidations?: {
    elementNo: number;
    hepsiburadaSku: string;
    merchantSku: string;
    type: "MinLock" | "MaxLock";
    minPrice: number;
    maxPrice: number;
    description: string;
  }[];
  /** priceValidations doluysa MinLock/MaxLock ile otomatik kilitlenmiş SKU var */
  hasLockedItems: boolean;
};

export type { HbListingUpdateWarning };

const MAX_INVENTORY_UPLOAD_ITEMS = 4000;

// ─── Tekil güncelleme (DOĞRULANMIŞ) ──────────────────────────────────────────

export async function pushHbPriceStock(
  storeId: string,
  item: HbPriceStockItem
): Promise<{ ok: true } | { ok: false; message: string }> {
  const merchantId = await getHbMerchantId(storeId);
  const path = `/listings/merchantid/${encodeURIComponent(merchantId)}/sku/${encodeURIComponent(item.merchantSku)}`;

  const body: Record<string, unknown> = {};
  if (item.price != null) body.price = item.price;
  if (item.availableStock != null) body.availableStock = item.availableStock;
  if (item.dispatchTime != null) body.dispatchTime = item.dispatchTime;

  const res = await hbPutJson(storeId, "LISTING", path, body);
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

// ─── Birden fazla ürünü tek tek güncelle (DOĞRULANMIŞ tekil endpoint'i
// döngüyle çağırır — bulk upload endpoint'leri yerine güvenli fallback) ──────
// KISIT: HB dokümantasyonu "aynı anda devam eden/bekleyen istek sayısı 5'i
// geçemez" diyor — bu fonksiyon sıralı çalıştığı için (paralel değil) bu
// kısıtı doğal olarak ihlal etmez, ama yine de aralarda bekleme bırakılır.

export async function pushHbPriceStockBatch(
  storeId: string,
  items: HbPriceStockItem[]
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of items) {
    const r = await pushHbPriceStock(storeId, item);
    if (r.ok) {
      succeeded += 1;
    } else {
      failed += 1;
      errors.push(`${item.merchantSku}: ${r.message}`);
    }
    // Rate limit: Hepsiburada ~30 req/s → 40ms bekleme yeterli
    await new Promise((res) => setTimeout(res, 40));
  }

  return { succeeded, failed, errors };
}

// ─── 3.2 Inventory uploads (DOĞRULANMIŞ) ─────────────────────────────────────

function validateInventoryItem(
  item: HbInventoryUploadItem,
  index: number
): string | null {
  if (!item.HepsiburadaSku?.trim() && !item.MerchantSku?.trim()) {
    return `items[${index}]: HepsiburadaSku ve/veya MerchantSku zorunlu.`;
  }
  if (!Number.isFinite(item.Price)) {
    return `items[${index}]: Price zorunlu ve sayı olmalı.`;
  }
  if (!Number.isFinite(item.AvailableStock)) {
    return `items[${index}]: AvailableStock zorunlu ve sayı olmalı.`;
  }
  if (!Number.isFinite(item.DispatchTime)) {
    return `items[${index}]: DispatchTime zorunlu ve sayı olmalı.`;
  }
  const cargo = validateHbCargoCompanies(item);
  if (!cargo.ok) return `items[${index}]: ${cargo.message}`;

  if (
    item._referenceAveragePrice != null &&
    Number.isFinite(item._referenceAveragePrice)
  ) {
    const evalRes = evaluateHbPriceRange(item.Price, item._referenceAveragePrice);
    if (!evalRes.ok) {
      return `items[${index}]: ${evalRes.reason ?? "OutOfPriceRange"}`;
    }
  }
  return null;
}

/**
 * POST /listings/merchantid/{merchantId}/inventory-uploads
 * Response: { Id: string } (Inventory Upload Id)
 *
 * Content-Type: application/json; Accept: application/json (hbPostJson).
 * Max 4000 SKU. Aynı anda ≤5 devam eden istek (çağıran taraf yönetmeli).
 */
export async function bulkPushHbInventory(
  storeId: string,
  items: HbInventoryUploadItem[]
): Promise<HbFetchResult<{ Id: string }>> {
  if (!items.length) {
    return { ok: false, status: 400, message: "items boş olamaz." };
  }
  if (items.length > MAX_INVENTORY_UPLOAD_ITEMS) {
    return {
      ok: false,
      status: 400,
      message: `Tek istekte en fazla ${MAX_INVENTORY_UPLOAD_ITEMS} SKU (got ${items.length}).`,
    };
  }

  for (let i = 0; i < items.length; i++) {
    const err = validateInventoryItem(items[i]!, i);
    if (err) return { ok: false, status: 400, message: err };
  }

  const body = items.map((item) => {
    const row: Record<string, unknown> = {
      Price: item.Price,
      AvailableStock: item.AvailableStock,
      DispatchTime: item.DispatchTime,
    };
    if (item.HepsiburadaSku?.trim()) row.HepsiburadaSku = item.HepsiburadaSku.trim();
    if (item.MerchantSku?.trim()) row.MerchantSku = item.MerchantSku.trim();
    if (item.ProductName != null) row.ProductName = item.ProductName;
    if (item.MaximumPurchasableQuantity != null) {
      row.MaximumPurchasableQuantity = item.MaximumPurchasableQuantity;
    }
    if (item.CargoCompany1) row.CargoCompany1 = item.CargoCompany1;
    if (item.CargoCompany2) row.CargoCompany2 = item.CargoCompany2;
    if (item.CargoCompany3) row.CargoCompany3 = item.CargoCompany3;
    if (item.ShippingProfileName) row.ShippingProfileName = item.ShippingProfileName;
    return row;
  });

  const merchantId = await getHbMerchantId(storeId);
  const path = `/listings/merchantid/${encodeURIComponent(merchantId)}/inventory-uploads`;
  const res = await hbPostJson<Record<string, unknown>>(storeId, "LISTING", path, body);
  if (!res.ok) return res;

  const id = String(res.data?.Id ?? res.data?.id ?? "");
  if (!id) {
    logger.error("hb_inventory_upload_missing_id", { storeId, data: res.data });
    return {
      ok: false,
      status: res.status,
      message: "Inventory upload yanıtında Id yok.",
    };
  }
  return { ok: true, data: { Id: id }, status: res.status };
}

/**
 * Önceki oturumdaki placeholder adı korunarak inventory-uploads'a yönlendirildi.
 * İmza: HbInventoryUploadItem[] (genişletilmiş).
 */
export async function bulkPushHbPriceStock(
  storeId: string,
  items: HbInventoryUploadItem[]
): Promise<HbFetchResult<{ Id: string }>> {
  return bulkPushHbInventory(storeId, items);
}

// ─── 3.3 Inventory upload status ─────────────────────────────────────────────

function normalizeUploadStatus(raw: Record<string, unknown>): HbInventoryUploadStatus {
  const errorsRaw = raw.errors;
  let errors: HbInventoryUploadStatus["errors"] = null;
  if (Array.isArray(errorsRaw)) {
    errors = errorsRaw.map((e) => {
      const row = (e ?? {}) as Record<string, unknown>;
      return {
        ElementNo: Number(row.ElementNo ?? row.elementNo ?? 0),
        HepsiburadaSku: (row.HepsiburadaSku ?? row.hepsiburadaSku) as string | undefined,
        MerchantSku: (row.MerchantSku ?? row.merchantSku) as string | undefined,
        Errors: Array.isArray(row.Errors)
          ? (row.Errors as string[])
          : Array.isArray(row.errors)
            ? (row.errors as string[])
            : [],
      };
    });
  }

  const pvRaw = raw.priceValidations;
  const priceValidations = Array.isArray(pvRaw)
    ? pvRaw.map((v) => {
        const row = (v ?? {}) as Record<string, unknown>;
        const typeRaw = String(row.type ?? "");
        return {
          elementNo: Number(row.elementNo ?? row.ElementNo ?? 0),
          hepsiburadaSku: String(row.hepsiburadaSku ?? row.HepsiburadaSku ?? ""),
          merchantSku: String(row.merchantSku ?? row.MerchantSku ?? ""),
          type: (typeRaw === "MinLock" || typeRaw === "MaxLock"
            ? typeRaw
            : "MaxLock") as "MinLock" | "MaxLock",
          minPrice: Number(row.minPrice ?? 0),
          maxPrice: Number(row.maxPrice ?? 0),
          description: String(row.description ?? ""),
        };
      })
    : undefined;

  const statusRaw = String(raw.status ?? "");
  const status: "Done" | "Failed" =
    statusRaw === "Failed" || statusRaw === "FAILED" ? "Failed" : "Done";

  return {
    id: String(raw.id ?? raw.Id ?? ""),
    status,
    createdAt: String(raw.createdAt ?? ""),
    total: Number(raw.total ?? 0),
    errors,
    priceValidations,
    hasLockedItems: Boolean(priceValidations?.length),
  };
}

/**
 * GET /listings/merchantid/{merchantId}/inventory-uploads/id/{inventoryUploadId}
 *
 * MinLock/MaxLock → ilgili SKU otomatik kilitlenir (ListingFrozen);
 * `hasLockedItems` ile UI kilit uyarısına yönlendirilebilir.
 */
export async function getHbInventoryUploadStatus(
  storeId: string,
  inventoryUploadId: string
): Promise<HbFetchResult<HbInventoryUploadStatus>> {
  const id = inventoryUploadId.trim();
  if (!id) {
    return { ok: false, status: 400, message: "inventoryUploadId zorunlu." };
  }
  const merchantId = await getHbMerchantId(storeId);
  const path = `/listings/merchantid/${encodeURIComponent(merchantId)}/inventory-uploads/id/${encodeURIComponent(id)}`;
  const res = await hbFetch<Record<string, unknown>>(storeId, "LISTING", path);
  if (!res.ok) return res;
  return {
    ok: true,
    status: res.status,
    data: normalizeUploadStatus(res.data ?? {}),
  };
}

/** Placeholder adı korunarak inventory status'e yönlendirildi. */
export async function pollHbBulkPushStatus(
  storeId: string,
  inventoryUploadId: string
): Promise<HbFetchResult<HbInventoryUploadStatus>> {
  return getHbInventoryUploadStatus(storeId, inventoryUploadId);
}

// ─── 3.4 Alt upload endpoint'leri — POST placeholder, GET status implement ───

/**
 * ÇIKARIM (doğrulanmadı): muhtemelen sadece Price alanını günceller,
 * inventory-uploads'un (3.2) alt kümesi. developers.hepsiburada.com'da
 * bu endpoint için ayrı bir alan tablosu bulunamadı.
 */
export async function bulkPushHbPrice(): Promise<never> {
  throw new Error(
    "HB_UNVERIFIED: price-uploads request body şeması ayrıca doğrulanamadı " +
      "— inventory-uploads (bulkPushHbInventory) kullanın, o tam belgeli."
  );
}

/**
 * ÇIKARIM (doğrulanmadı): muhtemelen sadece AvailableStock.
 */
export async function bulkPushHbStock(): Promise<never> {
  throw new Error(
    "HB_UNVERIFIED: stock-uploads request body şeması ayrıca doğrulanamadı " +
      "— inventory-uploads (bulkPushHbInventory) kullanın, o tam belgeli."
  );
}

/**
 * ÇIKARIM (doğrulanmadı): muhtemelen kargo/dispatch alanları.
 */
export async function bulkPushHbShippingInfo(): Promise<never> {
  throw new Error(
    "HB_UNVERIFIED: shipping-info-uploads request body şeması ayrıca " +
      "doğrulanamadı — inventory-uploads (bulkPushHbInventory) kullanın."
  );
}

/**
 * ÇIKARIM (doğrulanmadı): muhtemelen ek bilgi alanları.
 */
export async function bulkPushHbAdditionalInfo(): Promise<never> {
  throw new Error(
    "HB_UNVERIFIED: additional-info-uploads request body şeması ayrıca " +
      "doğrulanamadı — inventory-uploads (bulkPushHbInventory) kullanın."
  );
}

/**
 * Response şekli inventory-uploads ailesinden çıkarımla kullanılıyor,
 * ayrıca doğrulanmadı (GET/okuma istisnası).
 */
async function pollHbUploadStatusFamily(
  storeId: string,
  kind:
    | "price-uploads"
    | "stock-uploads"
    | "shipping-info-uploads"
    | "additional-info-uploads",
  uploadId: string
): Promise<HbFetchResult<HbInventoryUploadStatus>> {
  const id = uploadId.trim();
  if (!id) {
    return { ok: false, status: 400, message: "uploadId zorunlu." };
  }
  const merchantId = await getHbMerchantId(storeId);
  const path = `/listings/merchantid/${encodeURIComponent(merchantId)}/${kind}/id/${encodeURIComponent(id)}`;
  const res = await hbFetch<Record<string, unknown>>(storeId, "LISTING", path);
  if (!res.ok) return res;
  return {
    ok: true,
    status: res.status,
    data: normalizeUploadStatus(res.data ?? {}),
  };
}

/** @see pollHbUploadStatusFamily — response şekli ayrıca doğrulanmadı */
export async function pollHbPriceUploadStatus(storeId: string, uploadId: string) {
  return pollHbUploadStatusFamily(storeId, "price-uploads", uploadId);
}

/** @see pollHbUploadStatusFamily — response şekli ayrıca doğrulanmadı */
export async function pollHbStockUploadStatus(storeId: string, uploadId: string) {
  return pollHbUploadStatusFamily(storeId, "stock-uploads", uploadId);
}

/** @see pollHbUploadStatusFamily — response şekli ayrıca doğrulanmadı */
export async function pollHbShippingInfoUploadStatus(
  storeId: string,
  uploadId: string
) {
  return pollHbUploadStatusFamily(storeId, "shipping-info-uploads", uploadId);
}

/** @see pollHbUploadStatusFamily — response şekli ayrıca doğrulanmadı */
export async function pollHbAdditionalInfoUploadStatus(
  storeId: string,
  uploadId: string
) {
  return pollHbUploadStatusFamily(storeId, "additional-info-uploads", uploadId);
}

/** Geriye dönük tip adı */
export type HbBulkPushResult =
  | { ok: true; trackingId: string }
  | { ok: false; message: string };
