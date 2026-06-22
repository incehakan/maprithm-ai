import { prisma } from "./prisma";
import { trendyolFetch } from "./trendyolFetch";
import { trendyolSystemFetch } from "./trendyolSystemFetch";
import {
  normalizeCategoryAttributeData,
  normalizeCategoryAttributeValueData,
  normalizeCategoryAttributeValueDataV2
} from "./trendyolNormalize";
import { buildTrendyolV2Path } from "./trendyolPartnerApiV2";

export type CategoryAttributeItem = Record<string, unknown>;

type CategoryAttributesApiResponse = {
  id?: number;
  name?: string;
  categoryAttributes?: CategoryAttributeItem[];
};

export function extractCategoryAttributeItems(
  data: unknown,
  requestCategoryId: number
): CategoryAttributeItem[] {
  if (data === null || data === undefined) return [];
  if (Array.isArray(data)) {
    return data.filter(
      (x): x is CategoryAttributeItem =>
        x !== null && typeof x === "object"
    ) as CategoryAttributeItem[];
  }
  if (typeof data === "object") {
    const o = data as CategoryAttributesApiResponse;
    const list = o.categoryAttributes;
    if (Array.isArray(list)) {
      return list.filter(
        (x): x is CategoryAttributeItem =>
          x !== null && typeof x === "object"
      ) as CategoryAttributeItem[];
    }
  }
  return [];
}

export type SyncOneCategoryAttributesResult =
  | { success: true; attributeCount: number; valueCount: number }
  | { success: false; status: number; message: string };

/**
 * Tek bir categoryId için Trendyol'dan özellikleri çeker ve DB'ye upsert eder.
 */
export async function syncTrendyolCategoryAttributesForCategory(
  userId: string,
  storeId: string,
  categoryId: number
): Promise<SyncOneCategoryAttributesResult> {
  const path = `/integration/product/product-categories/${categoryId}/attributes`;
  const result = await trendyolFetch<unknown>(userId, storeId, path);

  if (!result.ok) {
    return {
      success: false,
      status: result.status || 500,
      message: result.message || "Trendyol API hatası."
    };
  }

  const items = extractCategoryAttributeItems(result.data, categoryId);
  const now = new Date();

  let attributeCount = 0;
  let valueCount = 0;

  for (const item of items) {
    const normalized = normalizeCategoryAttributeData(item, categoryId);
    if (!normalized) continue;

    const attrRow = await prisma.trendyolCategoryAttribute.upsert({
      where: {
        categoryId_attributeId: {
          categoryId: normalized.categoryId,
          attributeId: normalized.attributeId
        }
      },
      create: {
        categoryId: normalized.categoryId,
        attributeId: normalized.attributeId,
        attributeName: normalized.attributeName,
        isRequired: normalized.isRequired,
        isVariantable: normalized.isVariantable,
        allowCustom: normalized.allowCustom,
        rawData: normalized.rawData,
        lastSyncedAt: now
      },
      update: {
        attributeName: normalized.attributeName,
        isRequired: normalized.isRequired,
        isVariantable: normalized.isVariantable,
        allowCustom: normalized.allowCustom,
        rawData: normalized.rawData,
        lastSyncedAt: now
      }
    });

    attributeCount++;

    const valuesRaw = item.attributeValues;
    if (!Array.isArray(valuesRaw)) continue;

    for (const v of valuesRaw) {
      const valNorm = normalizeCategoryAttributeValueData(v);
      if (!valNorm) continue;

      await prisma.trendyolCategoryAttributeValue.upsert({
        where: {
          categoryAttributeId_attributeValueId: {
            categoryAttributeId: attrRow.id,
            attributeValueId: valNorm.attributeValueId
          }
        },
        create: {
          categoryAttributeId: attrRow.id,
          attributeValueId: valNorm.attributeValueId,
          attributeValue: valNorm.attributeValue,
          rawData: valNorm.rawData
        },
        update: {
          attributeValue: valNorm.attributeValue,
          rawData: valNorm.rawData
        }
      });
      valueCount++;
    }
  }

  return { success: true, attributeCount, valueCount };
}

export async function syncTrendyolCategoryAttributesForCategorySystem(
  categoryId: number
): Promise<SyncOneCategoryAttributesResult> {
  const path = `/integration/product/product-categories/${categoryId}/attributes`;
  const result = await trendyolSystemFetch<unknown>(path);
  if (!result.ok) {
    return {
      success: false,
      status: result.status || 500,
      message: result.message || "Trendyol API hatası."
    };
  }

  const items = extractCategoryAttributeItems(result.data, categoryId);
  const now = new Date();
  let attributeCount = 0;
  let valueCount = 0;

  for (const item of items) {
    const normalized = normalizeCategoryAttributeData(item, categoryId);
    if (!normalized) continue;

    const attrRow = await prisma.trendyolCategoryAttribute.upsert({
      where: {
        categoryId_attributeId: {
          categoryId: normalized.categoryId,
          attributeId: normalized.attributeId
        }
      },
      create: {
        categoryId: normalized.categoryId,
        attributeId: normalized.attributeId,
        attributeName: normalized.attributeName,
        isRequired: normalized.isRequired,
        isVariantable: normalized.isVariantable,
        allowCustom: normalized.allowCustom,
        removedAt: null,
        rawData: normalized.rawData,
        lastSyncedAt: now
      },
      update: {
        attributeName: normalized.attributeName,
        isRequired: normalized.isRequired,
        isVariantable: normalized.isVariantable,
        allowCustom: normalized.allowCustom,
        removedAt: null,
        rawData: normalized.rawData,
        lastSyncedAt: now
      }
    });

    attributeCount++;
    const valuesRaw = item.attributeValues;
    if (!Array.isArray(valuesRaw)) continue;
    for (const v of valuesRaw) {
      const valNorm = normalizeCategoryAttributeValueData(v);
      if (!valNorm) continue;
      await prisma.trendyolCategoryAttributeValue.upsert({
        where: {
          categoryAttributeId_attributeValueId: {
            categoryAttributeId: attrRow.id,
            attributeValueId: valNorm.attributeValueId
          }
        },
        create: {
          categoryAttributeId: attrRow.id,
          attributeValueId: valNorm.attributeValueId,
          attributeValue: valNorm.attributeValue,
          removedAt: null,
          rawData: valNorm.rawData
        },
        update: {
          attributeValue: valNorm.attributeValue,
          removedAt: null,
          rawData: valNorm.rawData
        }
      });
      valueCount++;
    }
  }

  return { success: true, attributeCount, valueCount };
}

type AttributeValuesV2Page = {
  content?: unknown[];
};

async function fetchAllCategoryAttributeValuesV2(
  categoryId: number,
  attributeId: number,
  fetchPage: (path: string) => Promise<{ ok: boolean; data?: unknown; message?: string }>
): Promise<unknown[]> {
  const out: unknown[] = [];
  let page = 0;
  const size = 1000;
  while (page <= 1000) {
    const path = `${buildTrendyolV2Path("getCategoryAttributeValues", {
      categoryId,
      attributeId
    })}?page=${page}&size=${size}`;
    const result = await fetchPage(path);
    if (!result.ok) break;
    const data = result.data as AttributeValuesV2Page | unknown[];
    const batch = Array.isArray(data)
      ? data
      : Array.isArray(data?.content)
        ? data.content
        : [];
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < size) break;
    page++;
  }
  return out;
}

/**
 * V2 kategori özellik senkronu: özellikler ayrı uçtan, değerler getCategoryAttributeValues ile.
 */
export async function syncTrendyolCategoryAttributesForCategorySystemV2(
  categoryId: number
): Promise<SyncOneCategoryAttributesResult> {
  const attrPath = buildTrendyolV2Path("getCategoryAttributes", { categoryId });
  const result = await trendyolSystemFetch<unknown>(attrPath);
  if (!result.ok) {
    return {
      success: false,
      status: result.status || 500,
      message: result.message || "Trendyol V2 kategori özellik API hatası."
    };
  }

  const items = extractCategoryAttributeItems(result.data, categoryId);
  const now = new Date();
  let attributeCount = 0;
  let valueCount = 0;

  for (const item of items) {
    const normalized = normalizeCategoryAttributeData(item, categoryId);
    if (!normalized) continue;

    const attrRow = await prisma.trendyolCategoryAttribute.upsert({
      where: {
        categoryId_attributeId: {
          categoryId: normalized.categoryId,
          attributeId: normalized.attributeId
        }
      },
      create: {
        categoryId: normalized.categoryId,
        attributeId: normalized.attributeId,
        attributeName: normalized.attributeName,
        isRequired: normalized.isRequired,
        isVariantable: normalized.isVariantable,
        allowCustom: normalized.allowCustom,
        removedAt: null,
        rawData: normalized.rawData,
        lastSyncedAt: now
      },
      update: {
        attributeName: normalized.attributeName,
        isRequired: normalized.isRequired,
        isVariantable: normalized.isVariantable,
        allowCustom: normalized.allowCustom,
        removedAt: null,
        rawData: normalized.rawData,
        lastSyncedAt: now
      }
    });
    attributeCount++;

    const valuesRaw = await fetchAllCategoryAttributeValuesV2(
      categoryId,
      normalized.attributeId,
      async (path) => {
        const r = await trendyolSystemFetch<unknown>(path);
        return { ok: r.ok, data: r.data, message: r.message };
      }
    );

    for (const v of valuesRaw) {
      const valNorm = normalizeCategoryAttributeValueDataV2(v);
      if (!valNorm) continue;
      await prisma.trendyolCategoryAttributeValue.upsert({
        where: {
          categoryAttributeId_attributeValueId: {
            categoryAttributeId: attrRow.id,
            attributeValueId: valNorm.attributeValueId
          }
        },
        create: {
          categoryAttributeId: attrRow.id,
          attributeValueId: valNorm.attributeValueId,
          attributeValue: valNorm.attributeValue,
          removedAt: null,
          rawData: valNorm.rawData
        },
        update: {
          attributeValue: valNorm.attributeValue,
          removedAt: null,
          rawData: valNorm.rawData
        }
      });
      valueCount++;
    }
  }

  return { success: true, attributeCount, valueCount };
}

/** Trendyol: aynı endpoint'e 10 sn içinde max ~50 istek — kısa gecikme */
const DELAY_MS_BETWEEN_CATEGORY_REQUESTS = 220;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SyncAllLeafCategoryAttributesResult = {
  categoriesProcessed: number;
  categoriesFailed: number;
  attributeCount: number;
  valueCount: number;
  failedCategoryIds: number[];
};

/**
 * DB'deki yaprak kategoriler (isLeaf=true, listelenebilir) için sırayla özellik senkronu.
 */
export async function syncTrendyolCategoryAttributesForAllLeafCategories(
  userId: string,
  storeId: string
): Promise<
  | { success: true; data: SyncAllLeafCategoryAttributesResult }
  | { success: false; status: number; message: string }
> {
  const leaves = await prisma.trendyolCategory.findMany({
    where: {
      isLeaf: true,
      OR: [{ isActive: null }, { isActive: true }]
    },
    select: { categoryId: true },
    orderBy: { categoryId: "asc" }
  });

  if (!leaves.length) {
    return {
      success: false,
      status: 400,
      message:
        "Yaprak kategori bulunamadı. Önce \"Kategorileri Çek\" ile kategori ağacını senkronize edin."
    };
  }

  let attributeCount = 0;
  let valueCount = 0;
  let categoriesProcessed = 0;
  const failedCategoryIds: number[] = [];

  for (let i = 0; i < leaves.length; i++) {
    const cid = leaves[i].categoryId as number;
    const one = await syncTrendyolCategoryAttributesForCategory(userId, storeId, cid);
    if (one.success) {
      categoriesProcessed++;
      attributeCount += one.attributeCount;
      valueCount += one.valueCount;
    } else {
      failedCategoryIds.push(cid);
    }

    if (i < leaves.length - 1) {
      await sleep(DELAY_MS_BETWEEN_CATEGORY_REQUESTS);
    }
  }

  return {
    success: true,
    data: {
      categoriesProcessed,
      categoriesFailed: failedCategoryIds.length,
      attributeCount,
      valueCount,
      failedCategoryIds
    }
  };
}

export async function syncTrendyolCategoryAttributesForAllLeafCategoriesSystem(options?: {
  useProductV2Paths?: boolean;
}): Promise<
  | { success: true; data: SyncAllLeafCategoryAttributesResult }
  | { success: false; status: number; message: string }
> {
  const useV2 = options?.useProductV2Paths === true;
  const leaves = await prisma.trendyolCategory.findMany({
    where: {
      isLeaf: true,
      removedAt: null,
      OR: [{ isActive: null }, { isActive: true }]
    },
    select: { categoryId: true },
    orderBy: { categoryId: "asc" }
  });

  if (!leaves.length) {
    return {
      success: false,
      status: 400,
      message: "Yaprak kategori bulunamadı."
    };
  }

  let attributeCount = 0;
  let valueCount = 0;
  let categoriesProcessed = 0;
  const failedCategoryIds: number[] = [];

  for (let i = 0; i < leaves.length; i++) {
    const cid = leaves[i].categoryId as number;
    const one = useV2
      ? await syncTrendyolCategoryAttributesForCategorySystemV2(cid)
      : await syncTrendyolCategoryAttributesForCategorySystem(cid);
    if (one.success) {
      categoriesProcessed++;
      attributeCount += one.attributeCount;
      valueCount += one.valueCount;
    } else {
      failedCategoryIds.push(cid);
    }
    if (i < leaves.length - 1) await sleep(DELAY_MS_BETWEEN_CATEGORY_REQUESTS);
  }

  return {
    success: true,
    data: {
      categoriesProcessed,
      categoriesFailed: failedCategoryIds.length,
      attributeCount,
      valueCount,
      failedCategoryIds
    }
  };
}
