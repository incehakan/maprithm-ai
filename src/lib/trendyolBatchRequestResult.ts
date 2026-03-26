/**
 * Trendyol getBatchRequestResult yanıtını parse eder.
 * @see https://developers.trendyol.com/v2.0/docs/check-batchrequest-result-getbatchrequestresult-1
 */

export type ParsedBatchItemStatus = "SUCCESS" | "FAILED" | "IN_PROGRESS" | "UNKNOWN";

export type ParsedBatchItem = {
  barcode: string | null;
  stockCode: string | null;
  productMainId: string | null;
  status: ParsedBatchItemStatus;
  failureReasons: string[];
};

export type ParsedBatchResult = {
  batchRequestId: string | null;
  batchStatus: string | null;
  itemCount: number;
  failedItemCount: number;
  batchRequestType: string | null;
  items: ParsedBatchItem[];
};

function normalizeItemStatus(raw: unknown): ParsedBatchItemStatus {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (s === "SUCCESS") return "SUCCESS";
  if (s === "FAILED") return "FAILED";
  if (s === "IN_PROGRESS") return "IN_PROGRESS";
  return "UNKNOWN";
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * requestItem içinden barkod / stok kodu / productMainId çıkarır (farklı batch tipleri).
 */
export function extractIdentifiersFromRequestItem(
  requestItem: unknown
): Pick<ParsedBatchItem, "barcode" | "stockCode" | "productMainId"> {
  let barcode: string | null = null;
  let stockCode: string | null = null;
  let productMainId: string | null = null;

  if (!requestItem || typeof requestItem !== "object") {
    return { barcode, stockCode, productMainId };
  }

  const ri = requestItem as Record<string, unknown>;

  barcode = asString(ri.barcode);

  const product = ri.product;
  if (product && typeof product === "object") {
    const p = product as Record<string, unknown>;
    if (!barcode) barcode = asString(p.barcode);
    stockCode = asString(p.stockCode);
    productMainId = asString(p.productMainId);
  }

  const updateRequest = ri.updateRequest;
  if (updateRequest && typeof updateRequest === "object") {
    const u = updateRequest as Record<string, unknown>;
    if (!barcode) barcode = asString(u.barcode);
    if (!stockCode) stockCode = asString(u.stockCode);
  }

  return { barcode, stockCode, productMainId };
}

function parseFailureReasons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : String(x)))
    .filter((s) => s.length > 0);
}

/**
 * Trendyol batch result JSON -> yapılandırılmış sonuç
 */
export function parseTrendyolBatchRequestResult(data: unknown): ParsedBatchResult {
  const empty: ParsedBatchResult = {
    batchRequestId: null,
    batchStatus: null,
    itemCount: 0,
    failedItemCount: 0,
    batchRequestType: null,
    items: []
  };

  if (data == null || typeof data !== "object") {
    return empty;
  }

  const root = data as Record<string, unknown>;

  const batchRequestId = asString(root.batchRequestId);
  const batchStatus = asString(root.status);
  const batchRequestType = asString(root.batchRequestType);
  const itemCount =
    typeof root.itemCount === "number" && Number.isFinite(root.itemCount)
      ? Math.max(0, Math.round(root.itemCount))
      : 0;
  const failedItemCount =
    typeof root.failedItemCount === "number" &&
    Number.isFinite(root.failedItemCount)
      ? Math.max(0, Math.round(root.failedItemCount))
      : 0;

  const itemsRaw = root.items;
  const items: ParsedBatchItem[] = [];

  if (Array.isArray(itemsRaw)) {
    for (const el of itemsRaw) {
      if (!el || typeof el !== "object") continue;
      const row = el as Record<string, unknown>;
      const ids = extractIdentifiersFromRequestItem(row.requestItem);
      items.push({
        ...ids,
        status: normalizeItemStatus(row.status),
        failureReasons: parseFailureReasons(row.failureReasons)
      });
    }
  }

  return {
    batchRequestId,
    batchStatus,
    itemCount: itemCount || items.length,
    failedItemCount,
    batchRequestType,
    items
  };
}

export type MappingMatchFields = {
  barcode: string | null;
  stockCode: string | null;
  productMainId: string | null;
};

/**
 * Mapping ile batch satırını eşleştirir (barkod öncelikli).
 */
export function batchItemMatchesMapping(
  mapping: MappingMatchFields,
  item: ParsedBatchItem
): boolean {
  const mb = mapping.barcode?.trim() ?? "";
  const ib = item.barcode?.trim() ?? "";
  if (mb && ib && mb === ib) return true;

  const ms = mapping.stockCode?.trim() ?? "";
  const isc = item.stockCode?.trim() ?? "";
  if (ms && isc && ms === isc) return true;

  const mp = mapping.productMainId?.trim() ?? "";
  const ip = item.productMainId?.trim() ?? "";
  if (mp && ip && mp === ip) return true;

  return false;
}

/**
 * Kullanıcıya gösterilecek kısa hata özeti
 */
export function friendlyBatchApiError(httpStatus: number, message: string): string {
  if (httpStatus === 401 || httpStatus === 403) {
    return "Trendyol API yetkisi reddedildi. API anahtarı ve satıcı bilgilerini kontrol edin.";
  }
  if (httpStatus === 404) {
    return "Bu batch kimliği Trendyol tarafında bulunamadı. Süre dolmuş olabilir (genelde 24 saat) veya kimlik hatalı.";
  }
  if (httpStatus === 0) {
    return `Bağlantı hatası: ${message}`;
  }
  return message || "Trendyol batch sonucu alınamadı.";
}
