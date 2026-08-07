import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import {
  syncTrendyolCategoryAttributes,
  syncTrendyolCategoryAttributesForAllLeafCategoriesSystem
} from "@/lib/trendyolSyncCategoryAttributes";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";

type Body = {
  categoryId?: unknown;
  syncAllLeafCategories?: unknown;
};

export async function POST(request: Request) {
  try {
    await requireSystemAdmin();
  } catch {
    return NextResponse.json({ error: "Bu işlem sadece sistem yöneticisi içindir." }, { status: 403 });
  }

  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const syncAll =
    body?.syncAllLeafCategories === true ||
    body?.syncAllLeafCategories === "true";

  if (syncAll) {
    try {
      const bulk = await syncTrendyolCategoryAttributesForAllLeafCategoriesSystem();

      if (!bulk.success) {
        return NextResponse.json(
          { error: bulk.message },
          { status: 400 }
        );
      }

      const d = bulk.data;

      await createActivityLog({
        userId: ctx.userId,
        storeId: ctx.storeId,
        membershipId: ctx.membershipId,
        action: "TRENDYOL_CATEGORY_ATTRIBUTES_SYNCED",
        entityType: "TRENDYOL_SYNC",
        entityId: null,
        message: `Trendyol kategori özellikleri senkronize edildi (${d.categoriesProcessed} yaprak kategori, ${d.attributeCount} özellik, ${d.valueCount} değer).`
      });

      return NextResponse.json({
        success: true,
        mode: "allLeaf" as const,
        categoriesProcessed: d.categoriesProcessed,
        categoriesFailed: d.categoriesFailed,
        attributeCount: d.attributeCount,
        valueCount: d.valueCount,
        message: `${d.categoriesProcessed} yaprak kategori işlendi; ${d.attributeCount} özellik, ${d.valueCount} değer kaydedildi.${d.categoriesFailed > 0 ? ` ${d.categoriesFailed} kategoride hata.` : ""}`
      });
    } catch (error) {
      console.error("Trendyol sync-category-attributes (bulk) error:", error);
      const msg =
        error instanceof Error
          ? error.message
          : "Toplu kategori özellikleri çekilirken hata oluştu.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const rawId = body?.categoryId;
  const categoryId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string"
        ? parseInt(rawId, 10)
        : NaN;

  if (
    !Number.isFinite(categoryId) ||
    categoryId <= 0 ||
    !Number.isInteger(categoryId)
  ) {
    return NextResponse.json(
      {
        error:
          "Geçerli bir categoryId gönderin veya tüm yapraklar için { \"syncAllLeafCategories\": true } kullanın."
      },
      { status: 400 }
    );
  }

  try {
    const one = await syncTrendyolCategoryAttributes(
      categoryId
    );

    if (!one.ok) {
      return NextResponse.json(
        { error: one.message },
        { status: 500 }
      );
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_CATEGORY_ATTRIBUTES_SYNCED",
      entityType: "TRENDYOL_SYNC",
      entityId: String(categoryId),
      message: `Trendyol kategori özellikleri senkronize edildi (kategori: ${categoryId}, ${one.attributeCount} özellik, ${one.valueCount} değer)`
    });

    return NextResponse.json({
      success: true,
      mode: "single" as const,
      categoryId,
      attributeCount: one.attributeCount,
      valueCount: one.valueCount,
      message: `${one.attributeCount} özellik, ${one.valueCount} değer kaydedildi.`
    });
  } catch (error) {
    console.error("Trendyol sync-category-attributes error:", error);
    const msg =
      error instanceof Error
        ? error.message
        : "Kategori özellikleri çekilirken hata oluştu.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
