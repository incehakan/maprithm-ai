export type CategoryAttrDef = {
  attributeId: number;
  attributeName: string;
  isRequired: boolean;
};

export type SavedMappingAttr = {
  attributeId: number;
  attributeValueId: number | null;
  customValue: string | null;
};

export type TrendyolMappingFieldsForReadiness = {
  trendyolBrandId: number | null;
  trendyolCategoryId: number | null;
  barcode: string | null;
  stockCode: string | null;
  productMainId: string | null;
  salePrice: number | null;
  quantity: number | null;
  mainImageUrl: string | null;
  imageUrls?: unknown;
};

/**
 * Trendyol yayınına hazırlık kontrolü — eksik alan listesi ve hazır/hazır değil.
 */
export function evaluateTrendyolMappingReadiness(
  mapping: TrendyolMappingFieldsForReadiness,
  categoryAttributeDefs: CategoryAttrDef[],
  savedAttributes: SavedMappingAttr[]
): { ready: boolean; missing: string[] } {
  const missing: string[] = [];

  if (mapping.trendyolBrandId == null) {
    missing.push("Trendyol marka seçilmedi");
  }
  if (mapping.trendyolCategoryId == null) {
    missing.push("Trendyol kategori seçilmedi");
  }

  const barcode = mapping.barcode?.trim() ?? "";
  if (!barcode) missing.push("Barkod girilmedi");

  const stockCode = mapping.stockCode?.trim() ?? "";
  if (!stockCode) missing.push("Satıcı stok kodu girilmedi");

  const productMainId = mapping.productMainId?.trim() ?? "";
  if (!productMainId) missing.push("Product Main ID girilmedi");

  if (mapping.salePrice == null || !Number.isFinite(mapping.salePrice)) {
    missing.push("Satış fiyatı girilmedi");
  } else if (mapping.salePrice <= 0) {
    missing.push("Satış fiyatı 0'dan büyük olmalı");
  }

  if (mapping.quantity == null || !Number.isFinite(mapping.quantity)) {
    missing.push("Stok (adet) girilmedi");
  } else if (mapping.quantity <= 0) {
    missing.push("Stok 0'dan büyük olmalı");
  }

  const img = mapping.mainImageUrl?.trim() ?? "";
  const imageArray =
    Array.isArray(mapping.imageUrls) ? mapping.imageUrls : [];
  const hasAnyImage =
    !!img ||
    imageArray.some(
      (x) =>
        typeof x === "string" &&
        (x.trim().startsWith("http://") || x.trim().startsWith("https://"))
    );
  if (!img) missing.push("Ana görsel URL girilmedi");
  if (!hasAnyImage) missing.push("En az 1 geçerli görsel URL zorunlu");

  const byAttrId = new Map<number, SavedMappingAttr>();
  for (const a of savedAttributes) {
    byAttrId.set(a.attributeId, a);
  }

  for (const def of categoryAttributeDefs) {
    if (!def.isRequired) continue;
    const row = byAttrId.get(def.attributeId);
    const hasValueId =
      row != null &&
      row.attributeValueId != null &&
      Number.isFinite(row.attributeValueId);
    const custom = row?.customValue?.trim() ?? "";
    if (!hasValueId && !custom) {
      missing.push(`Zorunlu özellik: ${def.attributeName} (${def.attributeId})`);
    }
  }

  return {
    ready: missing.length === 0,
    missing
  };
}

export type TrendyolPublishExtraMapping = {
  cargoCompanyId: number | null;
  listPrice: number | null;
  salePrice: number | null;
};

/**
 * Trendyol createProduct öncesi kontrol.
 * productMainId boş olabilir (sunucu otomatik üretir).
 * salePrice / quantity mapping boşsa productFallback kullanılır.
 */
export function evaluateTrendyolPublishReadiness(
  mapping: TrendyolMappingFieldsForReadiness & TrendyolPublishExtraMapping,
  categoryAttributeDefs: CategoryAttrDef[],
  savedAttributes: SavedMappingAttr[],
  productFallback?: { price: number; stock: number }
): { ready: boolean; missing: string[] } {
  const syntheticMainId =
    mapping.productMainId?.trim() || "AUTO-GENERATED-WILL-BE-USED";

  const saleForCheck =
    mapping.salePrice != null &&
    Number.isFinite(mapping.salePrice) &&
    mapping.salePrice > 0
      ? mapping.salePrice
      : productFallback != null &&
          Number.isFinite(productFallback.price) &&
          productFallback.price > 0
        ? productFallback.price
        : null;

  const qtyForCheck =
    mapping.quantity != null &&
    Number.isFinite(mapping.quantity) &&
    mapping.quantity > 0
      ? Math.round(mapping.quantity)
      : productFallback != null &&
          Number.isFinite(productFallback.stock) &&
          productFallback.stock > 0
        ? productFallback.stock
        : null;

  const base = evaluateTrendyolMappingReadiness(
    {
      ...mapping,
      productMainId: syntheticMainId,
      salePrice: saleForCheck,
      quantity: qtyForCheck
    },
    categoryAttributeDefs,
    savedAttributes
  );

  const missing = base.missing.filter(
    (m) => m !== "Product Main ID girilmedi"
  );

  if (
    mapping.cargoCompanyId == null ||
    !Number.isFinite(mapping.cargoCompanyId)
  ) {
    missing.push(
      "Kargo firma ID (cargoCompanyId) zorunlu — Trendyol ürün oluşturma için gerekli"
    );
  }

  const listOk =
    mapping.listPrice != null &&
    Number.isFinite(mapping.listPrice) &&
    mapping.listPrice > 0;
  const saleOk =
    saleForCheck != null && saleForCheck > 0;
  if (!saleOk && !listOk) {
    missing.push("Satış veya liste fiyatı 0'dan büyük olmalı");
  }

  return {
    ready: missing.length === 0,
    missing
  };
}
