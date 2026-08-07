import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { reconcileTrendyolCatalogWithLocalProducts } from "@/lib/trendyolCatalogReconcile";

export async function POST() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
    requirePermission(ctx, "marketplace.publish");
  } catch (e: any) {
    const msg =
      e?.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : e?.message === "FORBIDDEN"
          ? "Bu işlem için yetkiniz yok."
          : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: e?.message === "FORBIDDEN" ? 403 : 401 });
  }

  try {
    const result = await reconcileTrendyolCatalogWithLocalProducts({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Reconcile Trendyol catalog error:", error);
    const message = error instanceof Error ? error.message : "Eşleştirme sırasında hata oluştu.";
    // Bağlantı yok / satar kimliği eksik gibi kullanıcı girdisi kaynaklı durumlar için 400,
    // gerçek beklenmeyen sunucu hataları için 500 dön.
    const isUserInputError =
      message.includes("bağlantısı") || message.includes("satıcı kimliği");
    return NextResponse.json(
      { error: message },
      { status: isUserInputError ? 400 : 500 }
    );
  }
}
