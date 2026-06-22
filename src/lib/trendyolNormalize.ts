import type { Prisma } from "@prisma/client";

export type NormalizedTrendyolBrand = {
  brandId: number;
  name: string;
  isActive: boolean | null;
  rawData: Prisma.InputJsonValue;
};

export type NormalizedTrendyolCategory = {
  categoryId: number;
  name: string;
  isActive: boolean | null;
  rawData: Prisma.InputJsonValue;
};

/**
 * Trendyol / diğer API yanıtlarında sık görülen aktif/pasif alanlarını okur.
 * Bilgi yoksa null döner (silinmez, "bilinmiyor" anlamında).
 */
export function extractActiveFlagFromRecord(
  record: Record<string, unknown>
): boolean | null {
  if (typeof record.isActive === "boolean") return record.isActive;
  if (typeof record.active === "boolean") return record.active;
  if (typeof record.enabled === "boolean") return record.enabled;
  if (typeof record.status === "string") {
    const s = record.status.trim().toLowerCase();
    if (s === "active" || s === "aktif" || s === "1" || s === "true")
      return true;
    if (
      s === "inactive" ||
      s === "passive" ||
      s === "pasif" ||
      s === "0" ||
      s === "false"
    )
      return false;
  }
  if (typeof record.isPassive === "boolean") return !record.isPassive;
  return null;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

/**
 * Marka API satırını (tek obje) veritabanı alanlarına map eder.
 */
export function normalizeBrandData(
  rawApiData: unknown
): NormalizedTrendyolBrand | null {
  if (rawApiData === null || typeof rawApiData !== "object") {
    return null;
  }
  const o = rawApiData as Record<string, unknown>;
  const brandId = Number(o.id);
  const name = String(o.name ?? "").trim();
  if (!Number.isFinite(brandId) || brandId <= 0 || !name) {
    return null;
  }
  return {
    brandId,
    name,
    isActive: extractActiveFlagFromRecord(o),
    rawData: toJsonValue(rawApiData)
  };
}

/**
 * Kategori ağacındaki tek düğümü (id, name, subCategories, isteğe bağlı parentId) map eder.
 * parentCategoryId ve isLeaf senkron sırasında ağaç konumundan birleştirilir.
 */
export function normalizeCategoryData(
  rawApiData: unknown
): NormalizedTrendyolCategory | null {
  if (rawApiData === null || typeof rawApiData !== "object") {
    return null;
  }
  const o = rawApiData as Record<string, unknown>;
  const categoryId = Number(o.id);
  const name = String(o.name ?? "").trim();
  if (!Number.isFinite(categoryId) || categoryId <= 0 || !name) {
    return null;
  }
  return {
    categoryId,
    name,
    isActive: extractActiveFlagFromRecord(o),
    rawData: toJsonValue(rawApiData)
  };
}

/** Trendyol getCategoryAttributes — categoryAttributes[] tek elemanı */
export type NormalizedTrendyolCategoryAttribute = {
  categoryId: number;
  attributeId: number;
  attributeName: string;
  isRequired: boolean;
  isVariantable: boolean;
  allowCustom: boolean;
  rawData: Prisma.InputJsonValue;
};

/** Trendyol attributeValues[] tek elemanı */
export type NormalizedTrendyolCategoryAttributeValue = {
  attributeValueId: number;
  attributeValue: string;
  rawData: Prisma.InputJsonValue;
};

/**
 * Trendyol categoryAttributes dizisindeki tek öğeyi normalize eder.
 * @param requestCategoryId - İstekte gönderilen yaprak kategori ID (API'de categoryId yoksa kullanılır)
 */
export function normalizeCategoryAttributeData(
  rawApiData: unknown,
  requestCategoryId: number
): NormalizedTrendyolCategoryAttribute | null {
  if (rawApiData === null || typeof rawApiData !== "object") {
    return null;
  }
  const o = rawApiData as Record<string, unknown>;

  const fromApi = Number(o.categoryId);
  const categoryId =
    Number.isFinite(fromApi) && fromApi > 0 ? fromApi : requestCategoryId;
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return null;
  }

  const attr = o.attribute;
  if (attr === null || typeof attr !== "object") {
    return null;
  }
  const a = attr as Record<string, unknown>;
  const attributeId = Number(a.id);
  const attributeName = String(a.name ?? "").trim();
  if (!Number.isFinite(attributeId) || attributeId <= 0 || !attributeName) {
    return null;
  }

  return {
    categoryId,
    attributeId,
    attributeName,
    isRequired: typeof o.required === "boolean" ? o.required : false,
    isVariantable: typeof o.varianter === "boolean" ? o.varianter : false,
    allowCustom: typeof o.allowCustom === "boolean" ? o.allowCustom : false,
    rawData: toJsonValue(rawApiData)
  };
}

/**
 * attributeValues içindeki tek değeri normalize eder (id + name).
 */
export function normalizeCategoryAttributeValueData(
  rawApiData: unknown
): NormalizedTrendyolCategoryAttributeValue | null {
  if (rawApiData === null || typeof rawApiData !== "object") {
    return null;
  }
  const o = rawApiData as Record<string, unknown>;
  const attributeValueId = Number(o.id);
  const attributeValue = String(o.name ?? "").trim();
  if (
    !Number.isFinite(attributeValueId) ||
    attributeValueId <= 0 ||
    !attributeValue
  ) {
    return null;
  }
  return {
    attributeValueId,
    attributeValue,
    rawData: toJsonValue(rawApiData)
  };
}

/** V2 getCategoryAttributeValues — attributeValueId + attributeValueName */
export function normalizeCategoryAttributeValueDataV2(
  rawApiData: unknown
): NormalizedTrendyolCategoryAttributeValue | null {
  if (rawApiData === null || typeof rawApiData !== "object") {
    return null;
  }
  const o = rawApiData as Record<string, unknown>;
  const attributeValueId = Number(o.attributeValueId ?? o.id);
  const attributeValue = String(
    o.attributeValueName ?? o.attributeValue ?? o.name ?? ""
  ).trim();
  if (
    !Number.isFinite(attributeValueId) ||
    attributeValueId <= 0 ||
    !attributeValue
  ) {
    return null;
  }
  return {
    attributeValueId,
    attributeValue,
    rawData: toJsonValue(rawApiData)
  };
}
