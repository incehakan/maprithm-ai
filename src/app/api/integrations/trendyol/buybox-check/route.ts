import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { runBuyboxCheckForStore } from "@/lib/buyboxRepricing";

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    // Son kaydedilmiş anlık görüntüyü döner (yeni kontrol tetiklemez)
    const mappings = await prisma.productMarketplaceMapping.findMany({
      where: {
        storeId: ctx.storeId,
        platform: "trendyol",
        publishStatus: "published",
        buyboxCheckedAt: { not: null }
      },
      include: { product: true },
      orderBy: { buyboxCheckedAt: "desc" }
    });

    const rows = mappings.map((m) => {
      const ourPrice = Number(m.product.price);
      const winning = m.buyboxOrder === 1;
      const gapToWin =
        !winning && m.buyboxPrice != null ? Math.round((ourPrice - m.buyboxPrice) * 100) / 100 : null;
      return {
        productId: m.productId,
        productName: m.product.name,
        barcode: m.barcode,
        ourPrice,
        buyboxOrder: m.buyboxOrder,
        buyboxPrice: m.buyboxPrice,
        hasMultipleSeller: m.hasMultipleSeller,
        secondBuyboxPrice: m.secondBuyboxPrice,
        thirdBuyboxPrice: m.thirdBuyboxPrice,
        winningBuybox: winning,
        gapToWin,
        checkedAt: m.buyboxCheckedAt
      };
    });

    return NextResponse.json({ rows, lastCheckedAt: rows[0]?.checkedAt ?? null });
  } catch (error) {
    console.error("Get buybox snapshot error:", error);
    return NextResponse.json({ error: "Buybox verisi alınırken hata oluştu." }, { status: 500 });
  }
}

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
    const result = await runBuyboxCheckForStore({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Buybox check error:", error);
    const message = error instanceof Error ? error.message : "Buybox kontrolü sırasında hata oluştu.";
    const isUserInputError = message.includes("bağlantı") || message.includes("sellerId");
    return NextResponse.json({ error: message }, { status: isUserInputError ? 400 : 500 });
  }
}
