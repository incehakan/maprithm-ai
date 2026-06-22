/**
 * Trendyol Ürün API V2 path sabitleri ve yardımcıları.
 * Path'ler developers.trendyol.com/reference OpenAPI tanımlarından doğrulandı (2026-06-22).
 * STAGE canlı denemesi: henüz yapılmadı — rollout öncesi teyit gerekir.
 */

export type TrendyolV2HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type TrendyolV2PathVerification = {
  verified: boolean;
  method: TrendyolV2HttpMethod;
  /** `/integration` sonrası path şablonu; `{sellerId}` vb. placeholder'lar */
  pathTemplate: string;
  verifiedVia: "openapi-docs" | "stage" | "mcp" | null;
  verifiedAt: string | null;
  notes?: string;
};

function op(
  method: TrendyolV2HttpMethod,
  pathTemplate: string,
  notes?: string
): TrendyolV2PathVerification {
  return {
    verified: true,
    method,
    pathTemplate,
    verifiedVia: "openapi-docs",
    verifiedAt: "2026-06-22",
    notes
  };
}

/** Doğrulanmamış operasyon — implementasyona geçmeden önce teyit gerekir */
function unverified(
  method: TrendyolV2HttpMethod,
  pathTemplate: string
): TrendyolV2PathVerification {
  return {
    verified: false,
    method,
    pathTemplate,
    verifiedVia: null,
    verifiedAt: null
  };
}

/**
 * V2 operasyon path şablonları.
 * Tam URL: `{baseUrl}/integration{pathTemplate}` (baseUrl = stageapigw veya apigw).
 */
export const V2_PATH_META = {
  createProducts: op("POST", "/product/sellers/{sellerId}/v2/products"),
  updateUnapprovedProducts: op(
    "POST",
    "/product/sellers/{sellerId}/products/unapproved-bulk-update"
  ),
  updateApprovedProductContent: op(
    "POST",
    "/product/sellers/{sellerId}/products/content-bulk-update"
  ),
  updateApprovedProductVariant: op(
    "POST",
    "/product/sellers/{sellerId}/products/variant-bulk-update"
  ),
  updateApprovedProductDelivery: op(
    "POST",
    "/product/sellers/{sellerId}/products/delivery-info-bulk-update"
  ),
  updatePriceAndInventory: op(
    "POST",
    "/inventory/sellers/{sellerId}/products/price-and-inventory",
    "V1 ile aynı path (OpenAPI V2 referansı)"
  ),
  getBatchRequestResult: op(
    "GET",
    "/product/sellers/{sellerId}/products/batch-requests/{batchRequestId}",
    "V1 ile aynı path (OpenAPI V2 referansı)"
  ),
  deleteProducts: op(
    "DELETE",
    "/product/sellers/{sellerId}/products",
    "V1 ile aynı path ve method (OpenAPI V2 referansı)"
  ),
  archiveProducts: op(
    "PUT",
    "/product/sellers/{sellerId}/products/archive-state"
  ),
  unlockProducts: op("PUT", "/product/sellers/{sellerId}/products/unlock"),
  getBuyboxInformation: op(
    "POST",
    "/product/sellers/{sellerId}/products/buybox-information"
  ),
  getProductBase: op("GET", "/product/sellers/{sellerId}/product/{barcode}"),
  filterApprovedProducts: op(
    "GET",
    "/product/sellers/{sellerId}/products/approved"
  ),
  filterUnapprovedProducts: op(
    "GET",
    "/product/sellers/{sellerId}/products/unapproved"
  ),
  getBrands: op(
    "GET",
    "/product/brands",
    "V1 ile aynı path; query: page, size"
  ),
  getCategoryTree: op(
    "GET",
    "/product/product-categories",
    "V1 ile aynı path"
  ),
  getCategoryAttributes: op(
    "GET",
    "/product/categories/{categoryId}/attributes"
  ),
  getCategoryAttributeValues: op(
    "GET",
    "/product/categories/{categoryId}/attributes/{attributeId}/values"
  )
} as const satisfies Record<string, TrendyolV2PathVerification>;

export type TrendyolV2OperationKey = keyof typeof V2_PATH_META;

/** Path şablonundan gerçek path üretir */
export function buildTrendyolV2Path(
  operation: TrendyolV2OperationKey,
  params: Record<string, string | number>
): string {
  const template = V2_PATH_META[operation].pathTemplate;
  return `/integration${template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = params[key];
    if (v == null || v === "") {
      throw new Error(`Trendyol V2 path parametresi eksik: ${key} (${operation})`);
    }
    return encodeURIComponent(String(v));
  })}`;
}

/** @deprecated V2_PATH_META kullanın — geriye dönük kısa alias */
export const V2_PATHS = Object.fromEntries(
  Object.entries(V2_PATH_META).map(([k, v]) => [k, v.pathTemplate])
) as Record<TrendyolV2OperationKey, string>;
