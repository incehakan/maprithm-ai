/**
 * Hepsiburada Listeleme — Buybox, Komisyon, Listing okuma, Satışa Aç/Kapat.
 *
 * Base: HB_BASE.LISTING, authMode: basic.
 * Kaynak: developers.hepsiburada.com (2026-08-02 doğrulama oturumu).
 *
 * Katalog / OMS / İade / Finans dosyalarına dokunulmaz.
 */

import {
  getHbMerchantId,
  hbFetch,
  hbPostJson,
  type HbFetchResult,
} from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

// ─── Ortak hata / uyarı tipleri ──────────────────────────────────────────────

export const HB_LISTING_ERROR_MESSAGES: Record<number, string> = {
  400: "Geçersiz istek (bad request).",
  401: "Kimlik doğrulama başarısız — kullanıcı adı/şifre hatalı.",
  404: "URL veya kaynak bulunamadı.",
  405: "HTTP metodu bu endpoint için desteklenmiyor.",
  429: "Rate limit aşıldı (Too Many Requests).",
  500: "Hepsiburada sunucu hatası — destek bileti açılması gerekir.",
};

export type HbListingUpdateWarning =
  | "ProductNotFound"
  | "MismatchingSkusSpecified"
  | "DuplicateHepsiburadaSkuSpecified"
  | "DuplicateMerchantSkuSpecified"
  | "MissingHeaders"
  | "InvalidPrice"
  | "InvalidAvailableStock"
  | "InvalidDispatchTime"
  | "DiscountedListingPriceIncrease"
  | "MerchantAlreadyListedAgainstProduct"
  | "ListingDeletedRecently"
  | "ListingFrozen"
  | "MissingStandardCargoCompany"
  | "OutOfPriceRange"
  | "restrictedProductBrand"
  | "InvalidMaximumPurchasableQuantity";

/** Geçerli kargo firması adları (tam bu yazımla). */
export const HB_CARGO_COMPANIES = [
  "Yurtiçi Kargo",
  "Aras Kargo",
  "PTT Kargo",
  "Borusan Lojistik",
  "Horoz Lojistik",
  "HepsiJet",
  "MNG Kargo",
  "Sürat Kargo",
  "Ceva Lojistik",
  "UPS",
  "Mağaza Hesabı",
] as const;

export type HbCargoCompany = (typeof HB_CARGO_COMPANIES)[number];

/** Standart dışı firmalar — yanında en az bir standart kargo zorunlu. */
export const HB_NON_STANDARD_CARGO_COMPANIES = new Set<HbCargoCompany>([
  "HepsiJet",
  "Horoz Lojistik",
  "Borusan Lojistik",
]);

export const HB_STANDARD_CARGO_COMPANIES = HB_CARGO_COMPANIES.filter(
  (c) => !HB_NON_STANDARD_CARGO_COMPANIES.has(c)
);

function enrichListingError(status: number, message: string): string {
  const hint = HB_LISTING_ERROR_MESSAGES[status];
  if (!hint) return message;
  if (message.includes(hint)) return message;
  return `${message} (${hint})`;
}

function withListingError<T>(res: HbFetchResult<T>): HbFetchResult<T> {
  if (res.ok) return res;
  return {
    ...res,
    message: enrichListingError(res.status, res.message),
  };
}

// ─── 1. Buybox ───────────────────────────────────────────────────────────────

export type HbBuyboxEntry = {
  SKU: string;
  Rank: number;
  Price: number;
  DispatchTime: number;
  MerchantRating: number;
};

/**
 * GET /buybox-orders/merchantid/{merchantId}
 *
 * Sadece IsSalable=true olan SKU'lar için sorgulanabilir.
 * Maksimum 10 SKU.
 *
 * Query: `skuList` (virgülle ayrılmış). Canlı API boş değerde
 * `"skuList cannot be empty"` döner — parametre adı bu nedenle `skuList`.
 */
export async function getHbBuyboxOrders(
  storeId: string,
  skus: string[]
): Promise<HbFetchResult<HbBuyboxEntry[]>> {
  const cleaned = skus.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return { ok: false, status: 400, message: "En az bir SKU gerekli." };
  }
  if (cleaned.length > 10) {
    return {
      ok: false,
      status: 400,
      message: "Buybox sorgusu en fazla 10 SKU kabul eder (API'ye gönderilmedi).",
    };
  }

  const merchantId = await getHbMerchantId(storeId);
  const qs = new URLSearchParams({ skuList: cleaned.join(",") });
  const path = `/buybox-orders/merchantid/${encodeURIComponent(merchantId)}?${qs}`;
  const res = await hbFetch<unknown>(storeId, "LISTING", path);
  if (!res.ok) return withListingError(res);

  const rows = Array.isArray(res.data)
    ? res.data
    : Array.isArray((res.data as { items?: unknown[] })?.items)
      ? (res.data as { items: unknown[] }).items
      : [];

  const data: HbBuyboxEntry[] = rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      SKU: String(r.SKU ?? r.sku ?? r.hepsiburadaSku ?? r.merchantSku ?? ""),
      Rank: Number(r.Rank ?? r.rank ?? r.buyboxOrder ?? 0),
      Price: Number(r.Price ?? r.price ?? r.buyboxPrice ?? 0),
      DispatchTime: Number(r.DispatchTime ?? r.dispatchTime ?? 0),
      MerchantRating: Number(r.MerchantRating ?? r.merchantRating ?? 0),
    };
  });

  return { ok: true, data, status: res.status };
}

// ─── 2. Komisyon ─────────────────────────────────────────────────────────────

/**
 * GET /commissions/merchantid/{merchantId}
 *
 * Doğrulanan: path, Basic Auth, istek başına maks. 50 SKU,
 * rate limit ~240 istek/dk/merchant (aşılırsa 429).
 *
 * Query parametre adı: buybox ile aynı desen — `skuList` (virgüllü CSV).
 * (Eski varsayım `skus` idi; canlı API buybox/commission için `skuList` bekliyor.)
 *
 * Response alan şeması bulunamadı → `data: unknown` + log.
 */
export async function getHbCommissions(
  storeId: string,
  skus: string[]
): Promise<HbFetchResult<unknown>> {
  const cleaned = skus.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return { ok: false, status: 400, message: "En az bir SKU gerekli." };
  }
  if (cleaned.length > 50) {
    return {
      ok: false,
      status: 400,
      message: "Komisyon sorgusu en fazla 50 SKU kabul eder (API'ye gönderilmedi).",
    };
  }

  const merchantId = await getHbMerchantId(storeId);
  const qs = new URLSearchParams({ skuList: cleaned.join(",") });
  const path = `/commissions/merchantid/${encodeURIComponent(merchantId)}?${qs}`;
  const res = await hbFetch<unknown>(storeId, "LISTING", path);

  if (!res.ok) {
    const message = enrichListingError(res.status, res.message);
    if (res.status === 429) {
      return {
        ok: false,
        status: 429,
        message: `${message} — rate limit (dakikada ~240 istek/merchant).`,
      };
    }
    return { ok: false, status: res.status, message };
  }

  logger.info("hb_commissions_response", {
    storeId,
    skuCount: cleaned.length,
    sample: res.data,
  });

  return res;
}

// ─── 3.1 Listing çekme ───────────────────────────────────────────────────────

export type HbListing = {
  HepsiburadaSku: string;
  MerchantSku: string;
  Price: number;
  AvailableStock: number;
  DispatchTime: number;
  CargoCompany1?: string;
  CargoCompany2?: string;
  CargoCompany3?: string;
  ShippingAddressLabel?: string;
  shippingProfileName?: string;
  ClaimAddressLabel?: string;
  Pricing?: {
    FinalPrice: number;
    StartDate?: string;
    EndDate?: string;
    Debtor?: string;
    Amount?: number;
  };
  MaximumPurchasableQuantity?: number;
  IsSalable: boolean;
  CustomizableProperties?: boolean;
  IsSuspended: boolean;
  IsLocked: boolean;
  LockReasons?: string[];
  IsFrozen: boolean;
  priceIncreaseDisabled?: boolean;
  priceDecreaseDisabled?: boolean;
  stockDecreaseDisabled?: boolean;
};

export type HbListingsPage = {
  listings: HbListing[];
  totalCount: number;
  limit: number;
  offset: number;
};

export type GetHbListingsParams = {
  /** Zorunlu pagination */
  offset: number;
  limit: number;
  /** Virgülle veya dizi — HepsiburadaSku filtresi */
  hepsiburadaSkus?: string[];
  /** Virgülle veya dizi — MerchantSku filtresi */
  merchantSkus?: string[];
  salableListings?: boolean;
  notsalableListings?: boolean;
};

function normalizeListingRow(raw: Record<string, unknown>): HbListing {
  const pricingRaw = (raw.Pricing ?? raw.pricing) as Record<string, unknown> | undefined;
  return {
    HepsiburadaSku: String(raw.HepsiburadaSku ?? raw.hepsiburadaSku ?? ""),
    MerchantSku: String(raw.MerchantSku ?? raw.merchantSku ?? ""),
    Price: Number(raw.Price ?? raw.price ?? 0),
    AvailableStock: Number(raw.AvailableStock ?? raw.availableStock ?? 0),
    DispatchTime: Number(raw.DispatchTime ?? raw.dispatchTime ?? 0),
    CargoCompany1: (raw.CargoCompany1 ?? raw.cargoCompany1) as string | undefined,
    CargoCompany2: (raw.CargoCompany2 ?? raw.cargoCompany2) as string | undefined,
    CargoCompany3: (raw.CargoCompany3 ?? raw.cargoCompany3) as string | undefined,
    ShippingAddressLabel: (raw.ShippingAddressLabel ??
      raw.shippingAddressLabel) as string | undefined,
    shippingProfileName: (raw.shippingProfileName ??
      raw.ShippingProfileName) as string | undefined,
    ClaimAddressLabel: (raw.ClaimAddressLabel ?? raw.claimAddressLabel) as
      | string
      | undefined,
    Pricing: pricingRaw
      ? {
          FinalPrice: Number(pricingRaw.FinalPrice ?? pricingRaw.finalPrice ?? 0),
          StartDate: (pricingRaw.StartDate ?? pricingRaw.startDate) as
            | string
            | undefined,
          EndDate: (pricingRaw.EndDate ?? pricingRaw.endDate) as string | undefined,
          Debtor: (pricingRaw.Debtor ?? pricingRaw.debtor) as string | undefined,
          Amount:
            pricingRaw.Amount != null || pricingRaw.amount != null
              ? Number(pricingRaw.Amount ?? pricingRaw.amount)
              : undefined,
        }
      : undefined,
    MaximumPurchasableQuantity:
      raw.MaximumPurchasableQuantity != null ||
      raw.maximumPurchasableQuantity != null
        ? Number(raw.MaximumPurchasableQuantity ?? raw.maximumPurchasableQuantity)
        : undefined,
    IsSalable: Boolean(raw.IsSalable ?? raw.isSalable),
    CustomizableProperties:
      raw.CustomizableProperties != null || raw.customizableProperties != null
        ? Boolean(raw.CustomizableProperties ?? raw.customizableProperties)
        : undefined,
    IsSuspended: Boolean(raw.IsSuspended ?? raw.isSuspended),
    IsLocked: Boolean(raw.IsLocked ?? raw.isLocked),
    LockReasons: Array.isArray(raw.LockReasons)
      ? (raw.LockReasons as string[])
      : Array.isArray(raw.lockReasons)
        ? (raw.lockReasons as string[])
        : undefined,
    IsFrozen: Boolean(raw.IsFrozen ?? raw.isFrozen),
    priceIncreaseDisabled:
      raw.priceIncreaseDisabled != null
        ? Boolean(raw.priceIncreaseDisabled)
        : undefined,
    priceDecreaseDisabled:
      raw.priceDecreaseDisabled != null
        ? Boolean(raw.priceDecreaseDisabled)
        : undefined,
    stockDecreaseDisabled:
      raw.stockDecreaseDisabled != null
        ? Boolean(raw.stockDecreaseDisabled)
        : undefined,
  };
}

/**
 * GET /listings/merchantid/{merchantId}
 * Pagination zorunlu (offset + limit).
 */
export async function getHbListings(
  storeId: string,
  params: GetHbListingsParams
): Promise<HbFetchResult<HbListingsPage>> {
  if (!Number.isFinite(params.offset) || params.offset < 0) {
    return { ok: false, status: 400, message: "offset ≥ 0 olmalı." };
  }
  if (!Number.isFinite(params.limit) || params.limit < 1) {
    return { ok: false, status: 400, message: "limit ≥ 1 olmalı (pagination zorunlu)." };
  }

  const merchantId = await getHbMerchantId(storeId);
  const qs = new URLSearchParams({
    offset: String(params.offset),
    limit: String(params.limit),
  });
  if (params.hepsiburadaSkus?.length) {
    qs.set("hbSkuList", params.hepsiburadaSkus.map((s) => s.trim()).filter(Boolean).join(","));
  }
  if (params.merchantSkus?.length) {
    qs.set(
      "merchantSkuList",
      params.merchantSkus.map((s) => s.trim()).filter(Boolean).join(",")
    );
  }
  if (params.salableListings !== undefined) {
    qs.set("salable-listings", String(params.salableListings));
  }
  if (params.notsalableListings !== undefined) {
    qs.set("notsalable-listings", String(params.notsalableListings));
  }

  const path = `/listings/merchantid/${encodeURIComponent(merchantId)}?${qs}`;
  const res = await hbFetch<unknown>(storeId, "LISTING", path);
  if (!res.ok) return withListingError(res);

  const body = res.data as Record<string, unknown> | unknown[];
  const listRaw = Array.isArray(body)
    ? body
    : Array.isArray((body as { listings?: unknown[] })?.listings)
      ? (body as { listings: unknown[] }).listings
      : [];

  const listings = listRaw.map((row) =>
    normalizeListingRow((row ?? {}) as Record<string, unknown>)
  );
  const pageBody = (Array.isArray(body) ? {} : body) as Record<string, unknown>;

  return {
    ok: true,
    status: res.status,
    data: {
      listings,
      totalCount: Number(pageBody.totalCount ?? listings.length),
      limit: Number(pageBody.limit ?? params.limit),
      offset: Number(pageBody.offset ?? params.offset),
    },
  };
}

// ─── 4. Satışa aç / kapat ────────────────────────────────────────────────────

/**
 * POST /listings/merchantid/{merchantId}/sku/{sku}/activate
 *
 * Davranış doğrulandı: stok ve fiyat önceden 0'dan farklı girilmiş olmalı.
 * HTTP metodu doküman sayfasında açıkça yazılmamış — state-transition
 * konvansiyonuna göre POST varsayıldı (çıkarım). İlk üretim denemesinde
 * 404/405 dönerse GET veya PUT denenmelidir.
 * Body gerekmez.
 */
export async function activateHbListing(
  storeId: string,
  sku: string
): Promise<HbFetchResult<unknown>> {
  const trimmed = sku.trim();
  if (!trimmed) {
    return { ok: false, status: 400, message: "sku zorunludur." };
  }
  const merchantId = await getHbMerchantId(storeId);
  const path = `/listings/merchantid/${encodeURIComponent(merchantId)}/sku/${encodeURIComponent(trimmed)}/activate`;
  const res = await hbPostJson(storeId, "LISTING", path, {});
  return withListingError(res);
}

/**
 * POST /listings/merchantid/{merchantId}/sku/{sku}/deactivate
 *
 * Alternatif: inventory-uploads ile stok/fiyat 0 göndermek de kapatır.
 * HTTP metodu çıkarım (POST) — 404/405'te GET/PUT denenmeli.
 */
export async function deactivateHbListing(
  storeId: string,
  sku: string
): Promise<HbFetchResult<unknown>> {
  const trimmed = sku.trim();
  if (!trimmed) {
    return { ok: false, status: 400, message: "sku zorunludur." };
  }
  const merchantId = await getHbMerchantId(storeId);
  const path = `/listings/merchantid/${encodeURIComponent(merchantId)}/sku/${encodeURIComponent(trimmed)}/deactivate`;
  const res = await hbPostJson(storeId, "LISTING", path, {});
  return withListingError(res);
}

// ─── 5. Toplu kilit kaldırma — PLACEHOLDER ───────────────────────────────────

/**
 * POST /listings/merchantid/{merchantId}/bulk-unlock
 * Dokümandaki referans linki 404 — şema alınamadı.
 */
export async function bulkUnlockHbListings(): Promise<never> {
  throw new Error(
    "HB_UNVERIFIED: bulk-unlock request body şeması alınamadı — " +
      "dokümandaki referans linki kırık (404). Muhtemelen [{HepsiburadaSku " +
      "veya MerchantSku, Price}] formatında ama teyit edilmeden implement " +
      "edilmedi. Kilitli SKU'ları önce GET listings (IsLocked=true) ile " +
      "tespit edip Hepsiburada satıcı destek/panel üzerinden manuel kilit " +
      "kaldırma önerilir."
  );
}

// ─── 6. sku/{sku}/merchantsku/{merchantSku} — PLACEHOLDER ────────────────────

/**
 * Path dışında hiçbir bilgi yok (method/davranış belirsiz).
 * Ayrı referans sayfası okunmadan implement edilmemeli.
 * Not: Mevcut tekil fiyat/stok PUT yolu `sku/{merchantSku}` — bu farklı.
 */
export async function updateHbListingMerchantSkuMapping(): Promise<never> {
  throw new Error(
    "HB_UNVERIFIED: sku/{sku}/merchantsku/{merchantSku} — path dışında " +
      "hiçbir bilgi yok (method, body, davranış). Ayrı bir referans sayfası " +
      "okunmadan implement edilmemeli. Tekil fiyat/stok için mevcut " +
      "pushHbPriceStock (PUT .../sku/{merchantSku}) kullanın."
  );
}

/** Kargo firması adlarını inventory-uploads öncesi doğrula. */
export function validateHbCargoCompanies(item: {
  CargoCompany1?: string;
  CargoCompany2?: string;
  CargoCompany3?: string;
}): { ok: true } | { ok: false; message: string } {
  const companies = [item.CargoCompany1, item.CargoCompany2, item.CargoCompany3].filter(
    (c): c is string => Boolean(c?.trim())
  );
  if (companies.length === 0) return { ok: true };

  const allowed = new Set<string>(HB_CARGO_COMPANIES);
  for (const c of companies) {
    if (!allowed.has(c)) {
      return {
        ok: false,
        message: `Geçersiz kargo firması: "${c}". Geçerli: ${HB_CARGO_COMPANIES.join(", ")}.`,
      };
    }
  }

  const hasNonStandard = companies.some((c) =>
    HB_NON_STANDARD_CARGO_COMPANIES.has(c as HbCargoCompany)
  );
  if (hasNonStandard) {
    const hasStandard = companies.some((c) =>
      (HB_STANDARD_CARGO_COMPANIES as readonly string[]).includes(c)
    );
    if (!hasStandard) {
      return {
        ok: false,
        message:
          "MissingStandardCargoCompany: HepsiJet/Horoz/Borusan ile birlikte " +
          "CargoCompany2 (veya diğer alanda) standart bir kargo firması gönderilmeli.",
      };
    }
  }

  return { ok: true };
}
