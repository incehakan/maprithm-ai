/**
 * Trendyol createProducts (POST .../sellers/{sellerId}/products) gövdesi.
 * @see https://developers.trendyol.com/v2.0/docs/product-create-createproducts
 */
import { buildMarketplaceImages } from "./productImages";
import {
  resolveMarketplaceListPrice,
  resolveMarketplaceQuantity,
  resolveMarketplaceSalePrice
} from "./trendyolMarketplaceCommercials";

export type TrendyolCreateProductAttribute =
  | { attributeId: number; attributeValueId: number }
  | { attributeId: number; customAttributeValue: string };

export type TrendyolCreateProductItem = {
  barcode: string;
  title: string;
  productMainId: string;
  brandId: number;
  categoryId: number;
  quantity: number;
  stockCode: string;
  dimensionalWeight: number;
  description: string;
  currencyType: string;
  listPrice: number;
  salePrice: number;
  vatRate: number;
  cargoCompanyId: number;
  shipmentAddressId?: number;
  returningAddressId?: number;
  images: Array<{ url: string }>;
  attributes: TrendyolCreateProductAttribute[];
};

export type BuildTrendyolProductPayloadInput = {
  product: {
    id: string;
    name: string;
    description: string | null;
    stock: number;
    price: number;
  };
  mapping: {
    barcode: string | null;
    stockCode: string | null;
    productMainId: string | null;
    trendyolBrandId: number | null;
    trendyolCategoryId: number | null;
    quantity: number | null;
    dimensionalWeight: number | null;
    currencyType: string | null;
    listPrice: number | null;
    salePrice: number | null;
    vatRate: number | null;
    cargoCompanyId: number | null;
    useProductPrice?: boolean | null;
    useProductStock?: boolean | null;
    mainImageUrl: string | null;
    imageUrls?: unknown;
  };
  /** Trendyol bağlantısından — createProduct zorunlu adres kimlikleri */
  shipmentAddressId: string;
  returnAddressId: string;
  mappingAttributes: Array<{
    attributeId: number;
    attributeValueId: number | null;
    customValue: string | null;
  }>;
  /** Ürün / ayarlardan — payload'da kullanılacak */
  fallbackVatRate: number;
};

export type TrendyolResolvedCommercials = {
  salePrice: number;
  listPrice: number;
  quantity: number;
};

export function resolveTrendyolCommercials(
  input: BuildTrendyolProductPayloadInput
): TrendyolResolvedCommercials {
  const salePrice =
    resolveMarketplaceSalePrice(input.product, input.mapping) ?? Number(input.product.price);
  const listPrice =
    resolveMarketplaceListPrice(input.product, input.mapping) ?? salePrice;
  const quantity =
    resolveMarketplaceQuantity(input.product, input.mapping) ?? input.product.stock;

  return { salePrice, listPrice, quantity };
}

/** Trendyol productMainId max 40 karakter */
export function buildAutoProductMainId(productId: string): string {
  const compact = productId.replace(/-/g, "");
  const prefix = "MAPRITHM-";
  const maxTotal = 40;
  const rest = maxTotal - prefix.length;
  return `${prefix}${compact.slice(0, Math.max(1, rest))}`;
}

function buildAttributes(
  rows: BuildTrendyolProductPayloadInput["mappingAttributes"]
): TrendyolCreateProductAttribute[] {
  const out: TrendyolCreateProductAttribute[] = [];
  for (const r of rows) {
    const vid = r.attributeValueId;
    const custom = r.customValue?.trim() ?? "";
    if (vid != null && Number.isFinite(vid) && vid > 0) {
      out.push({ attributeId: r.attributeId, attributeValueId: Math.round(vid) });
    } else if (custom) {
      out.push({
        attributeId: r.attributeId,
        customAttributeValue: custom
      });
    }
  }
  return out;
}

/**
 * Tek ürün için `items` dizisinde kullanılacak nesneyi üretir.
 * Yayın öncesi validasyon ayrı yapılmalıdır.
 */
export function buildTrendyolCreateProductItem(
  input: BuildTrendyolProductPayloadInput
): TrendyolCreateProductItem {
  const {
    product,
    mapping,
    mappingAttributes,
    fallbackVatRate,
    shipmentAddressId: shipRaw,
    returnAddressId: retRaw
  } = input;

  const ship = parseInt(String(shipRaw).trim(), 10);
  const ret = parseInt(String(retRaw).trim(), 10);
  if (!Number.isFinite(ship) || ship <= 0 || !Number.isFinite(ret) || ret <= 0) {
    throw new Error(
      "Gönderim ve iade adresi kimlikleri geçersiz (Trendyol ayarlarından seçin)."
    );
  }

  const title = (product.name || "Ürün").slice(0, 100);
  const descRaw = product.description?.trim() || product.name || title;
  const description =
    descRaw.length > 30000 ? descRaw.slice(0, 30000) : descRaw;

  const productMainId =
    mapping.productMainId?.trim() || buildAutoProductMainId(product.id);

  const barcode = mapping.barcode!.trim();
  const stockCode = mapping.stockCode!.trim();

  const { salePrice, listPrice, quantity } = resolveTrendyolCommercials(input);

  const dimensionalWeight =
    mapping.dimensionalWeight != null &&
    Number.isFinite(mapping.dimensionalWeight) &&
    mapping.dimensionalWeight > 0
      ? mapping.dimensionalWeight
      : 1;

  const currencyType = (mapping.currencyType?.trim() || "TRY").toUpperCase();

  const vatRaw =
    mapping.vatRate != null && Number.isFinite(mapping.vatRate)
      ? mapping.vatRate
      : fallbackVatRate;
  const vatRate = Math.round(vatRaw);

  const images = buildMarketplaceImages({
    mainImageUrl: mapping.mainImageUrl,
    imageUrls: mapping.imageUrls ?? null
  });
  if (images.length === 0) {
    throw new Error("Yayın için en az 1 geçerli görsel URL gerekir.");
  }

  const cargoRaw = mapping.cargoCompanyId;
  if (cargoRaw == null) {
    throw new Error(
      "cargoCompanyId zorunlu (Trendyol kargo firması seçin veya mağaza varsayılanını ayarlayın)."
    );
  }
  const cargoNum = Number(cargoRaw);
  if (!Number.isFinite(cargoNum) || cargoNum <= 0) {
    throw new Error("cargoCompanyId pozitif bir sayı olmalı.");
  }
  const cargoCompanyId = Math.round(cargoNum);

  return {
    barcode,
    title,
    productMainId: productMainId.slice(0, 40),
    brandId: mapping.trendyolBrandId!,
    categoryId: mapping.trendyolCategoryId!,
    quantity,
    stockCode: stockCode.slice(0, 100),
    dimensionalWeight,
    description,
    currencyType,
    listPrice,
    salePrice,
    vatRate,
    cargoCompanyId,
    shipmentAddressId: ship,
    returningAddressId: ret,
    images,
    attributes: buildAttributes(mappingAttributes)
  };
}

export function buildTrendyolCreateProductBody(
  input: BuildTrendyolProductPayloadInput
): { items: TrendyolCreateProductItem[] } {
  return { items: [buildTrendyolCreateProductItem(input)] };
}

/** Trendyol yanıtından batchRequestId çıkarır */
export function extractBatchRequestId(data: unknown): string | null {
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const direct = o.batchRequestId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (typeof direct === "number" && Number.isFinite(direct)) return String(direct);
  const nested = o.result;
  if (nested && typeof nested === "object") {
    const r = nested as Record<string, unknown>;
    const b = r.batchRequestId;
    if (typeof b === "string" && b.trim()) return b.trim();
    if (typeof b === "number" && Number.isFinite(b)) return String(b);
  }
  return null;
}
