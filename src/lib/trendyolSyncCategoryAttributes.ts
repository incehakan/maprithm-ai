import { prisma } from "@/lib/prisma";
import { trendyolSystemFetch } from "@/lib/trendyolSystemFetch";

/** Prisma/Postgres bind-variable limiti (~32767) için güvenli upsert paket boyutu. */
const CHUNK_SIZE = 500;

const SYSTEM_STORE_ID = "00000000-0000-0000-0000-000000000000";

type AttributeValueRaw = {
  id: number;
  name: string;
};

type CategoryAttributeRaw = {
  category: { id: number; name: string };
  attribute: { id: number; name: string };
  required: boolean;
  varianter: boolean;
  slicer: boolean;
  allowCustom: boolean;
  attributeValues: AttributeValueRaw[];
};

type AttributesResponse = {
  categoryAttributes: CategoryAttributeRaw[];
};

export async function syncTrendyolCategoryAttributes(
  categoryId: number,
  options?: { useProductV2Paths?: boolean }
): Promise<{ ok: boolean; message?: string; attributeCount?: number; valueCount?: number }> {
  try {
    const v2 = options?.useProductV2Paths;
    const url = v2
      ? `/integration/product/product-categories/${categoryId}/attributes?size=1000&page=0`
      : `/integration/product/product-categories/${categoryId}/attributes`;

    const result = await trendyolSystemFetch<AttributesResponse | CategoryAttributeRaw[]>(url);
    if (!result.ok) {
      throw new Error(result.message || "Trendyol API isteği başarısız.");
    }

    let arr: CategoryAttributeRaw[];
    if (Array.isArray(result.data)) {
      arr = result.data;
    } else if (result.data?.categoryAttributes) {
      arr = result.data.categoryAttributes;
    } else {
      arr = [];
    }

    if (arr.length === 0) {
      return { ok: true, attributeCount: 0, valueCount: 0, message: "Kategori özelliği bulunamadı." };
    }

    let attributeCount = 0;
    let valueCount = 0;
    const now = new Date();

    // 1) Özellik satırlarını 500'lük transaction chunk'larıyla yaz
    for (let i = 0; i < arr.length; i += CHUNK_SIZE) {
      const chunk = arr.slice(i, i + CHUNK_SIZE);
      await prisma.$transaction(
        chunk.map((attr) => {
          const aId = attr.attribute.id;
          const metadata = {
            isVariantable: attr.varianter,
            allowCustom: attr.allowCustom,
            isSlicer: attr.slicer
          };
          return prisma.marketplaceAttribute.upsert({
            where: {
              storeId_platform_categoryId_externalId: {
                storeId: SYSTEM_STORE_ID,
                platform: "TRENDYOL",
                categoryId: categoryId.toString(),
                externalId: aId.toString()
              }
            },
            create: {
              storeId: SYSTEM_STORE_ID,
              platform: "TRENDYOL",
              categoryId: categoryId.toString(),
              externalId: aId.toString(),
              name: attr.attribute.name,
              required: attr.required,
              metadata: metadata as any,
              createdAt: now,
              updatedAt: now
            },
            update: {
              name: attr.attribute.name,
              required: attr.required,
              metadata: metadata as any,
              updatedAt: now
            }
          });
        })
      );
      attributeCount += chunk.length;
    }

    // 2) Değerler — parent attribute id gerekir; özellik bazında değerleri chunk'la
    for (const attr of arr) {
      const aId = attr.attribute.id;
      if (!attr.attributeValues || !Array.isArray(attr.attributeValues) || attr.attributeValues.length === 0) {
        continue;
      }

      const parentAttrRow = await prisma.marketplaceAttribute.findUnique({
        where: {
          storeId_platform_categoryId_externalId: {
            storeId: SYSTEM_STORE_ID,
            platform: "TRENDYOL",
            categoryId: categoryId.toString(),
            externalId: aId.toString()
          }
        },
        select: { id: true }
      });
      if (!parentAttrRow) continue;

      const values = attr.attributeValues;
      for (let i = 0; i < values.length; i += CHUNK_SIZE) {
        const chunk = values.slice(i, i + CHUNK_SIZE);
        await prisma.$transaction(
          chunk.map((val) =>
            prisma.marketplaceAttributeValue.upsert({
              where: {
                attributeId_externalId: {
                  attributeId: parentAttrRow.id,
                  externalId: val.id.toString()
                }
              },
              create: {
                attributeId: parentAttrRow.id,
                externalId: val.id.toString(),
                name: val.name,
                createdAt: now,
                updatedAt: now
              },
              update: {
                name: val.name,
                updatedAt: now
              }
            })
          )
        );
        valueCount += chunk.length;
      }
    }

    return { ok: true, attributeCount, valueCount };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Bilinmeyen hata"
    };
  }
}

export async function syncTrendyolCategoryAttributesForAllLeafCategoriesSystem(options?: {
  useProductV2Paths?: boolean;
}): Promise<{
  success: boolean;
  message: string;
  data: {
    categoriesProcessed: number;
    categoriesFailed: number;
    attributeCount: number;
    valueCount: number;
  };
}> {
  try {
    const leaves = await prisma.marketplaceCategory
      .findMany({
        where: {
          platform: "TRENDYOL",
          isActive: true
        },
        select: { externalId: true, metadata: true }
      })
      .then((list) =>
        list
          .map((c) => ({
            categoryId: parseInt(c.externalId, 10),
            isLeaf:
              c.metadata &&
              typeof c.metadata === "object" &&
              (c.metadata as { isLeaf?: boolean }).isLeaf === true
          }))
          .filter((c) => c.isLeaf && Number.isFinite(c.categoryId))
      );

    let processed = 0;
    let failed = 0;
    let attrTotal = 0;
    let valTotal = 0;

    for (const leaf of leaves) {
      const res = await syncTrendyolCategoryAttributes(leaf.categoryId, options);
      if (res.ok) {
        processed++;
        attrTotal += res.attributeCount ?? 0;
        valTotal += res.valueCount ?? 0;
      } else {
        failed++;
      }
    }

    return {
      success: true,
      message: `İşlem tamamlandı. (Başarılı: ${processed}, Başarısız: ${failed})`,
      data: {
        categoriesProcessed: processed,
        categoriesFailed: failed,
        attributeCount: attrTotal,
        valueCount: valTotal
      }
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Bilinmeyen hata",
      data: { categoriesProcessed: 0, categoriesFailed: 0, attributeCount: 0, valueCount: 0 }
    };
  }
}
