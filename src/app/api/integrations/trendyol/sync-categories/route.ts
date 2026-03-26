import { NextResponse } from "next/server";
import { trendyolFetch } from "@/lib/trendyolFetch";
import { createActivityLog } from "@/lib/activityLog";
import { normalizeCategoryData } from "@/lib/trendyolNormalize";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";

type TrendyolCategoryRaw = {
  id: number;
  name: string;
  parentId?: number;
  subCategories?: TrendyolCategoryRaw[];
};

type TrendyolCategoriesResponse = {
  categories?: TrendyolCategoryRaw[];
};

type FlatCategoryRow = {
  rawNode: TrendyolCategoryRaw;
  parentCategoryId: number | null;
  isLeaf: boolean;
};

function flattenCategories(
  nodes: TrendyolCategoryRaw[] | undefined,
  parentId: number | null
): FlatCategoryRow[] {
  const result: FlatCategoryRow[] = [];
  if (!nodes || !Array.isArray(nodes)) return result;

  for (const node of nodes) {
    const id = Number(node?.id);
    const name = String(node?.name ?? "").trim();
    if (!id || !name) continue;

    const sub = node.subCategories;
    const isLeaf = !sub || sub.length === 0;

    result.push({
      rawNode: node,
      parentCategoryId: parentId,
      isLeaf
    });

    if (!isLeaf) {
      result.push(...flattenCategories(sub, id));
    }
  }
  return result;
}

export async function POST() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    const result = await trendyolFetch<TrendyolCategoriesResponse>(
      ctx.userId,
      ctx.storeId,
      "/integration/product/product-categories"
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message || "Trendyol API hatası." },
        { status: result.status >= 400 ? result.status : 500 }
      );
    }

    const categories = result.data?.categories ?? [];
    const flat = flattenCategories(categories, null);
    const now = new Date();

    let totalProcessed = 0;
    for (const row of flat) {
      const normalized = normalizeCategoryData(row.rawNode);
      if (!normalized) continue;

      try {
        await prisma.trendyolCategory.upsert({
          where: { categoryId: normalized.categoryId },
          create: {
            categoryId: normalized.categoryId,
            name: normalized.name,
            parentCategoryId: row.parentCategoryId,
            isLeaf: row.isLeaf,
            isActive: normalized.isActive,
            rawData: normalized.rawData,
            lastSyncedAt: now
          },
          update: {
            name: normalized.name,
            parentCategoryId: row.parentCategoryId,
            isLeaf: row.isLeaf,
            isActive: normalized.isActive,
            rawData: normalized.rawData,
            lastSyncedAt: now
          }
        });
        totalProcessed++;
      } catch (e) {
        console.warn("Trendyol category upsert error:", e);
      }
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_CATEGORIES_SYNCED",
      entityType: "TRENDYOL_SYNC",
      entityId: null,
      message: `Trendyol kategorileri senkronize edildi (${totalProcessed} adet)`
    });

    return NextResponse.json({
      success: true,
      count: totalProcessed,
      message: `${totalProcessed} kategori senkronize edildi.`
    });
  } catch (error) {
    console.error("Trendyol sync-categories error:", error);
    const msg =
      error instanceof Error
        ? error.message
        : "Kategoriler çekilirken hata oluştu.";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
