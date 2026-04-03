import { prisma } from "@/lib/prisma";
import { getUserSettings } from "@/lib/userSettings";
import { resolveTrendyolCommercials } from "@/lib/trendyolCreateProductPayload";
import type { BuildTrendyolProductPayloadInput } from "@/lib/trendyolCreateProductPayload";
import { normalizeImageUrls } from "@/lib/productImages";
import type { CategoryAttrDef, SavedMappingAttr } from "@/lib/trendyolMappingReadiness";
import {
  TrendyolPrePublishErrorCode,
  TrendyolPrePublishWarningCode
} from "@/lib/validation/trendyolPublishErrorCodes";

export type PrePublishValidatorContext = {
  userId: string;
  storeId: string;
  membershipId: string;
  permissionKeys?: string[];
};

export type PrePublishValidationError = {
  code: string;
  message: string;
  field?: string;
};

export type PrePublishValidationWarning = {
  code: string;
  message: string;
};

export type PrePublishValidationResult = {
  isPublishable: boolean;
  errors: PrePublishValidationError[];
  warnings: PrePublishValidationWarning[];
};

const SHORT_DESCRIPTION_THRESHOLD = 80;
const WARN_MIN_IMAGE_COUNT = 2;

function pushError(
  errors: PrePublishValidationError[],
  code: string,
  message: string,
  field?: string
) {
  errors.push(field ? { code, message, field } : { code, message });
}

function pushWarning(warnings: PrePublishValidationWarning[], code: string, message: string) {
  warnings.push({ code, message });
}

/** ctx.storeId ve ctx.userId dolu mu */
export function validateStoreContext(
  ctx: PrePublishValidatorContext,
  errors: PrePublishValidationError[]
): boolean {
  if (!ctx.storeId?.trim() || !ctx.userId?.trim()) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.STORE_CONTEXT_INVALID,
      "Oturum veya aktif mağaza bilgisi eksik. Sayfayı yenileyip tekrar deneyin."
    );
    return false;
  }
  return true;
}

/** Aktif Trendyol bağlantısı ve satıcı kimliği */
export function validateTrendyolConnection(
  conn: {
    isActive: boolean;
    sellerId: string;
    shipmentAddressId: string | null;
    returnAddressId: string | null;
  } | null,
  errors: PrePublishValidationError[]
): conn is NonNullable<typeof conn> {
  if (!conn) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_CONNECTION_MISSING,
      "Trendyol mağaza bağlantısı bulunamadı. Ayarlar > Trendyol üzerinden bağlantı oluşturun.",
      "connection"
    );
    return false;
  }
  if (!conn.isActive) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_CONNECTION_INACTIVE,
      "Trendyol bağlantısı pasif. Ayarlardan bağlantıyı aktifleştirin.",
      "connection"
    );
    return false;
  }
  if (!String(conn.sellerId ?? "").trim()) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_SELLER_ID_MISSING,
      "Seller ID tanımlı değil. Trendyol bağlantı ayarlarına seller bilgisini girin.",
      "sellerId"
    );
    return false;
  }
  return true;
}

export function validateShipmentAddresses(
  conn: {
    shipmentAddressId: string | null;
    returnAddressId: string | null;
  },
  errors: PrePublishValidationError[]
): void {
  const ship = String(conn.shipmentAddressId ?? "").trim();
  const ret = String(conn.returnAddressId ?? "").trim();
  if (!ship || !ret) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_ADDRESSES_MISSING,
      "Gönderim ve iade adresi Trendyol bağlantısında seçilmemiş. Trendyol ayarlarından adresleri getirip kaydedin.",
      "addresses"
    );
  }
}

export function validateMappingBarcodeStockCategoryBrand(
  mapping: {
    barcode: string | null;
    stockCode: string | null;
    trendyolCategoryId: number | null;
    trendyolBrandId: number | null;
  },
  errors: PrePublishValidationError[]
): void {
  if (!String(mapping.barcode ?? "").trim()) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_BARCODE_MISSING,
      "Barkod zorunludur.",
      "barcode"
    );
  }
  if (!String(mapping.stockCode ?? "").trim()) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_STOCK_CODE_MISSING,
      "Satıcı stok kodu (stock code) zorunludur.",
      "stockCode"
    );
  }
  if (mapping.trendyolCategoryId == null || !Number.isFinite(mapping.trendyolCategoryId)) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_CATEGORY_MISSING,
      "Trendyol yaprak kategorisi seçilmedi.",
      "trendyolCategoryId"
    );
  }
  if (mapping.trendyolBrandId == null || !Number.isFinite(mapping.trendyolBrandId)) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_BRAND_MISSING,
      "Trendyol markası seçilmedi.",
      "trendyolBrandId"
    );
  }
}

export function validateRequiredCategoryAttributes(
  defs: CategoryAttrDef[],
  saved: SavedMappingAttr[],
  errors: PrePublishValidationError[]
): void {
  const byId = new Map<number, SavedMappingAttr>();
  for (const s of saved) {
    byId.set(s.attributeId, s);
  }
  for (const def of defs) {
    if (!def.isRequired) continue;
    const row = byId.get(def.attributeId);
    const hasValueId =
      row != null &&
      row.attributeValueId != null &&
      Number.isFinite(row.attributeValueId);
    const custom = row?.customValue?.trim() ?? "";
    if (!hasValueId && !custom) {
      pushError(
        errors,
        TrendyolPrePublishErrorCode.TRENDYOL_ATTRIBUTE_MISSING,
        `Zorunlu kategori özelliği doldurulmadı: ${def.attributeName}`,
        `attribute:${def.attributeId}`
      );
    }
  }
}

export function validateAtLeastOneImage(
  mainImageUrl: string | null | undefined,
  imageUrls: unknown,
  errors: PrePublishValidationError[]
): number {
  const urls = normalizeImageUrls([mainImageUrl ?? null, imageUrls ?? null]);
  if (urls.length === 0) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_IMAGE_MISSING,
      "En az bir geçerli görsel URL’si zorunludur (ana görsel veya ek görseller).",
      "images"
    );
  }
  return urls.length;
}

export function validatePriceAndStock(
  salePrice: number,
  listPrice: number,
  quantity: number | null,
  errors: PrePublishValidationError[]
): void {
  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_INVALID_PRICE,
      "Satış fiyatı 0’dan büyük olmalıdır (ana ürün fiyatı veya eşleştirmedeki satış fiyatı).",
      "price"
    );
  }
  if (!Number.isFinite(listPrice) || listPrice <= 0) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_LIST_PRICE_INVALID,
      "Liste fiyatı geçersiz veya 0; satış fiyatına göre ayarlayın.",
      "listPrice"
    );
  }
  if (quantity == null || !Number.isFinite(quantity) || quantity < 0) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_INVALID_STOCK,
      "Stok adedi geçersiz veya eksik (0 veya daha büyük bir tam sayı olmalı).",
      "stock"
    );
  }
}

export function validateCargo(
  mappingCargo: number | null | undefined,
  defaultCargo: number | null | undefined,
  errors: PrePublishValidationError[]
): void {
  const fromMapping =
    mappingCargo != null && Number.isFinite(mappingCargo) && mappingCargo > 0;
  const fromDefault =
    defaultCargo != null && Number.isFinite(defaultCargo) && defaultCargo > 0;
  if (!fromMapping && !fromDefault) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.TRENDYOL_CARGO_MISSING,
      "Kargo firması seçilmedi. Ürün eşleştirmede veya Trendyol ayarlarında varsayılan kargo tanımlayın.",
      "cargoCompanyId"
    );
  }
}

export function collectOptionalWarnings(
  product: {
    description: string | null;
    seoDescription: string | null;
    tags: string | null;
  },
  imageCount: number,
  warnings: PrePublishValidationWarning[]
): void {
  const desc = product.description?.trim() ?? "";
  if (desc.length > 0 && desc.length < SHORT_DESCRIPTION_THRESHOLD) {
    pushWarning(
      warnings,
      TrendyolPrePublishWarningCode.DESCRIPTION_SHORT,
      `Ürün açıklaması kısa (${desc.length} karakter). SEO ve dönüşüm için daha ayrıntılı metin önerilir.`
    );
  }
  if (imageCount > 0 && imageCount < WARN_MIN_IMAGE_COUNT) {
    pushWarning(
      warnings,
      TrendyolPrePublishWarningCode.FEW_IMAGES,
      `Yalnızca ${imageCount} görsel listeleniyor; birden fazla görsel eklemek önerilir.`
    );
  }
  const seo = product.seoDescription?.trim() ?? "";
  const tags = product.tags?.trim() ?? "";
  if (!seo && !tags) {
    pushWarning(
      warnings,
      TrendyolPrePublishWarningCode.SEO_EMPTY,
      "SEO açıklaması ve etiketler boş; arama görünürlüğü için doldurmayı düşünün."
    );
  }
}

/**
 * Trendyol ürün yayını öncesi doğrulama. Tüm Prisma sorguları storeId ile filtrelenir.
 */
export async function validateProductForTrendyolPublish(
  productId: string,
  ctx: PrePublishValidatorContext
): Promise<PrePublishValidationResult> {
  const errors: PrePublishValidationError[] = [];
  const warnings: PrePublishValidationWarning[] = [];

  if (!validateStoreContext(ctx, errors)) {
    return { isPublishable: false, errors, warnings };
  }

  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId: ctx.storeId, platform: "trendyol" },
    select: {
      isActive: true,
      sellerId: true,
      shipmentAddressId: true,
      returnAddressId: true,
      defaultCargoCompanyId: true
    }
  });

  if (!validateTrendyolConnection(conn, errors)) {
    return { isPublishable: false, errors, warnings };
  }

  validateShipmentAddresses(conn, errors);

  const product = await prisma.product.findFirst({
    where: { id: productId, userId: ctx.userId, storeId: ctx.storeId },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      stock: true,
      mainImageUrl: true,
      imageUrls: true,
      seoDescription: true,
      tags: true
    }
  });

  if (!product) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.PRODUCT_NOT_FOUND,
      "Ürün bulunamadı veya bu mağazaya ait değil.",
      "productId"
    );
    return { isPublishable: false, errors, warnings };
  }

  const mapping = await prisma.productMarketplaceMapping.findFirst({
    where: {
      productId,
      storeId: ctx.storeId,
      platform: "trendyol"
    },
    include: {
      attributes: {
        select: {
          attributeId: true,
          attributeName: true,
          attributeValueId: true,
          customValue: true
        }
      }
    }
  });

  if (!mapping) {
    pushError(
      errors,
      TrendyolPrePublishErrorCode.PRODUCT_NOT_FOUND,
      "Trendyol eşleştirmesi henüz yok. Önce eşleştirme kaydı oluşturun.",
      "mapping"
    );
    return { isPublishable: false, errors, warnings };
  }

  const settings = await getUserSettings({ userId: ctx.userId, storeId: ctx.storeId });

  const mappingPayload: BuildTrendyolProductPayloadInput["mapping"] = {
    barcode: mapping.barcode,
    stockCode: mapping.stockCode,
    productMainId: mapping.productMainId,
    trendyolBrandId: mapping.trendyolBrandId,
    trendyolCategoryId: mapping.trendyolCategoryId,
    quantity: mapping.quantity,
    dimensionalWeight: mapping.dimensionalWeight,
    currencyType: mapping.currencyType,
    listPrice: mapping.listPrice,
    salePrice: mapping.salePrice,
    vatRate: mapping.vatRate,
    cargoCompanyId: mapping.cargoCompanyId,
    useProductPrice: mapping.useProductPrice,
    useProductStock: mapping.useProductStock,
    mainImageUrl: mapping.mainImageUrl,
    imageUrls: mapping.imageUrls ?? undefined
  };

  validateMappingBarcodeStockCategoryBrand(
    {
      barcode: mapping.barcode,
      stockCode: mapping.stockCode,
      trendyolCategoryId: mapping.trendyolCategoryId,
      trendyolBrandId: mapping.trendyolBrandId
    },
    errors
  );

  let defs: CategoryAttrDef[] = [];
  if (mapping.trendyolCategoryId != null) {
    const attrRows = await prisma.trendyolCategoryAttribute.findMany({
      where: { categoryId: mapping.trendyolCategoryId },
      select: {
        attributeId: true,
        attributeName: true,
        isRequired: true
      }
    });
    defs = attrRows.map((a) => ({
      attributeId: a.attributeId,
      attributeName: a.attributeName,
      isRequired: a.isRequired
    }));
  }

  const savedAttrs: SavedMappingAttr[] = mapping.attributes.map((a) => ({
    attributeId: a.attributeId,
    attributeValueId: a.attributeValueId,
    customValue: a.customValue
  }));

  validateRequiredCategoryAttributes(defs, savedAttrs, errors);

  const mainForImages = mapping.mainImageUrl ?? product.mainImageUrl;
  const extraForImages = mapping.imageUrls ?? product.imageUrls;
  const imageCount = validateAtLeastOneImage(mainForImages, extraForImages, errors);

  const commercialInput: BuildTrendyolProductPayloadInput = {
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      stock: product.stock,
      price: Number(product.price)
    },
    mapping: mappingPayload,
    mappingAttributes: [],
    fallbackVatRate: settings.defaultVatRate ?? 20,
    shipmentAddressId: String(conn.shipmentAddressId ?? "0"),
    returnAddressId: String(conn.returnAddressId ?? "0")
  };

  const resolved = resolveTrendyolCommercials(commercialInput);
  validatePriceAndStock(resolved.salePrice, resolved.listPrice, resolved.quantity, errors);

  validateCargo(mapping.cargoCompanyId, conn.defaultCargoCompanyId, errors);

  collectOptionalWarnings(
    {
      description: product.description,
      seoDescription: product.seoDescription,
      tags: product.tags
    },
    imageCount,
    warnings
  );

  const isPublishable = errors.length === 0;
  return { isPublishable, errors, warnings };
}
