import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getCargoCompaniesForStore } from "@/lib/trendyol/getCargoCompaniesForStore";

/**
 * GET — kargo seçenekleri (önce DB; boşsa sync + yedek env/preset).
 */
export async function GET() {
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

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } }
  });

  if (!conn?.isActive) {
    return NextResponse.json(
      { error: "Aktif Trendyol bağlantısı yok." },
      { status: 400 }
    );
  }

  const result = await getCargoCompaniesForStore({
    userId: ctx.userId,
    storeId: ctx.storeId
  });

  const apiReachable = result.source === "db";

  return NextResponse.json({
    data: {
      source: result.source,
      syncPerformed: result.syncPerformed,
      syncUpserted: result.syncUpserted
    },
    options: result.options,
    source: result.source,
    apiReachable,
    carrierAttempts: result.attempts ?? [],
    primaryOk: result.primaryOk ?? false,
    primaryStatus: result.primaryStatus ?? 0
  });
}
