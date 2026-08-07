/**
 * Hepsiburada referans verilerini generic tablolara yazar.
 *
 * MarketplaceCategory  → Hepsiburada kategori ağacı (2.1 Basic Auth)
 * MarketplaceBrand     → Hepsiburada markalar
 * MarketplaceAttribute → Kategori özellikleri (2.2)
 * MarketplaceAttributeValue → Özellik değerleri (2.3, enum)
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  fetchHbCategories,
  fetchHbCategoryAttributes,
  fetchHbAttributeValues,
  searchHbBrands,
  type HbCategory,
  type HbAttribute,
} from "@/lib/hepsiburadaProductApi";

const PLATFORM = "hepsiburada";

// ─── Kategori sync ───────────────────────────────────────────────────────────

export async function syncHbCategories(storeId: string): Promise<{
  synced: number;
  errors: number;
}> {
  const res = await fetchHbCategories(storeId);
  if (!res.ok) throw new Error(`Kategori çekilemedi: ${res.message}`);

  let synced = 0;
  let errors = 0;
  const now = new Date();

  for (const cat of res.categories) {
    try {
      await prisma.marketplaceCategory.upsert({
        where: {
          storeId_platform_externalId: {
            storeId,
            platform: PLATFORM,
            externalId: String(cat.id),
          },
        },
        create: {
          storeId,
          platform: PLATFORM,
          externalId: String(cat.id),
          name: cat.name,
          parentId: cat.parentId != null ? String(cat.parentId) : null,
          isActive: true,
          metadata: { hasChildren: cat.hasChildren, leaf: cat.leaf } as unknown as Prisma.InputJsonValue,
        },
        update: {
          name: cat.name,
          parentId: cat.parentId != null ? String(cat.parentId) : null,
          isActive: true,
          metadata: { hasChildren: cat.hasChildren, leaf: cat.leaf } as unknown as Prisma.InputJsonValue,
          updatedAt: now,
        },
      });
      synced += 1;
    } catch {
      errors += 1;
    }
  }

  return { synced, errors };
}

// ─── Kategori özellikleri sync ────────────────────────────────────────────────

export async function syncHbCategoryAttributes(
  storeId: string,
  categoryId: number | string
): Promise<{ synced: number; errors: number }> {
  const res = await fetchHbCategoryAttributes(storeId, categoryId);
  if (!res.ok) throw new Error(`Özellikler çekilemedi: ${res.message}`);

  let synced = 0;
  let errors = 0;
  const now = new Date();

  for (const attr of res.attributes) {
    try {
      // MarketplaceAttribute upsert
      const attrRow = await prisma.marketplaceAttribute.upsert({
        where: {
          storeId_platform_categoryId_externalId: {
            storeId,
            platform: PLATFORM,
            categoryId: String(categoryId),
            externalId: String(attr.id),
          },
        },
        create: {
          storeId,
          platform: PLATFORM,
          categoryId: String(categoryId),
          externalId: String(attr.id),
          name: attr.name,
          required: attr.required,
          type: attr.type,
        },
        update: {
          name: attr.name,
          required: attr.required,
          type: attr.type,
          updatedAt: now,
        },
      });

      // Değerleri yaz — type "enum" ve values boş geldiyse ayrı endpoint'ten
      // (fetchHbAttributeValues) çekilir (bkz. dosya başı ve
      // hepsiburadaProductApi.ts — bazı özellikler değerlerini gömülü
      // döndürmüyor, /attribute/{id}/values ile ayrıca sorgulanmalı).
      let values = attr.values ?? [];
      if (values.length === 0 && attr.type.toLowerCase() === "enum") {
        const valuesRes = await fetchHbAttributeValues(storeId, categoryId, attr.id);
        if (valuesRes.ok) values = valuesRes.values;
      }

      for (const val of values) {
        await prisma.marketplaceAttributeValue.upsert({
          where: {
            attributeId_externalId: {
              attributeId: attrRow.id,
              externalId: String(val.id),
            },
          },
          create: {
            attributeId: attrRow.id,
            externalId: String(val.id),
            name: val.name,
          },
          update: {
            name: val.name,
            updatedAt: now,
          },
        });
      }

      synced += 1;
    } catch {
      errors += 1;
    }
  }

  return { synced, errors };
}

// ─── Marka sync (arama tabanlı) ───────────────────────────────────────────────

export async function syncHbBrands(
  storeId: string,
  brandNames: string[]
): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;
  const now = new Date();

  for (const name of brandNames) {
    try {
      const res = await searchHbBrands(storeId, name);
      if (!res.ok) continue;

      for (const brand of res.brands) {
        await prisma.marketplaceBrand.upsert({
          where: {
            storeId_platform_externalId: {
              storeId,
              platform: PLATFORM,
              externalId: String(brand.id),
            },
          },
          create: {
            storeId,
            platform: PLATFORM,
            externalId: String(brand.id),
            name: brand.name,
            isActive: true,
          },
          update: {
            name: brand.name,
            isActive: true,
            updatedAt: now,
          },
        });
        synced += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return { synced, errors };
}

// ─── Toplu referans sync (admin/cron için) ────────────────────────────────────

export async function syncAllHbReferences(storeId: string): Promise<{
  categories: { synced: number; errors: number };
}> {
  const categories = await syncHbCategories(storeId);
  return { categories };
}
