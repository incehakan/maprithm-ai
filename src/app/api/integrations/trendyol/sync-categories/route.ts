import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { syncGlobalTrendyolCategories } from "@/lib/trendyolReferenceSync";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";

export async function POST() {
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

  try {
    const categories = await syncGlobalTrendyolCategories();

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_CATEGORIES_SYNCED",
      entityType: "TRENDYOL_SYNC",
      entityId: null,
      message: `Global Trendyol kategorileri senkronize edildi (${categories.count} adet)`
    });

    return NextResponse.json({
      success: true,
      count: categories.count,
      message: `${categories.count} global kategori senkronize edildi.`
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
