import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { runBuyboxAutoRepriceForStore } from "@/lib/buyboxRepricing";

export async function POST() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
    requirePermission(ctx, "pricing.update");
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
    const result = await runBuyboxAutoRepriceForStore({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Buybox auto-reprice error:", error);
    const message = error instanceof Error ? error.message : "Yeniden fiyatlandırma sırasında hata oluştu.";
    const isUserInputError = message.includes("bağlantı") || message.includes("sellerId");
    return NextResponse.json({ error: message }, { status: isUserInputError ? 400 : 500 });
  }
}
