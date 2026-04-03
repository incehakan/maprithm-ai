import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getTrendyolCargoSelectOptions } from "@/lib/trendyolCargoSelectOptions";

/**
 * GET — kargo seçenekleri (MP hazır liste + Trendyol API + env + referans tablo).
 */
export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } }
  });

  if (!conn?.isActive) {
    return NextResponse.json(
      { error: "Aktif Trendyol bağlantısı yok." },
      { status: 400 }
    );
  }

  const result = await getTrendyolCargoSelectOptions({
    userId: ctx.userId,
    storeId: ctx.storeId
  });

  const apiReachable =
    result.primary.ok || result.carrierFb.items.length > 0;

  return NextResponse.json({
    data: result.data,
    options: result.options,
    source: result.source,
    apiReachable,
    carrierAttempts: result.carrierFb.attempts,
    primaryOk: result.primary.ok,
    primaryStatus: result.primary.status
  });
}
