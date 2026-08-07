import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { syncTrendyolCargoCompanies } from "@/lib/trendyol/syncTrendyolCargoCompanies";

/**
 * POST — Trendyol API’den kargo firmalarını çekip MarketplaceCarrier tablosuna yazar.
 */
export async function POST() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e && typeof e === "object" && (e as { message?: string }).message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  let result: Awaited<ReturnType<typeof syncTrendyolCargoCompanies>>;
  try {
    result = await syncTrendyolCargoCompanies({
      userId: ctx.userId,
      storeId: ctx.storeId
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Senkronizasyon hatası.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.message ?? "Senkronizasyon başarısız.",
        upserted: result.upserted,
        attempts: result.attempts
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    upserted: result.upserted,
    attempts: result.attempts,
    primaryOk: result.primaryOk,
    primaryStatus: result.primaryStatus,
    primaryPath: result.primaryPath
  });
}
