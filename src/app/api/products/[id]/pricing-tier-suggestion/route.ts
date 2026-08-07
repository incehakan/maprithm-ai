import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { getUserSettings } from "@/lib/userSettings";
import {
  resolveEffectivePricingInputs,
  buildPricingTierLabel,
  type PricingTierLike
} from "@/lib/pricingTiers";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    const product = await prisma.product.findFirst({
      where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
    });
    if (!product) {
      return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
    }

    const p = product as typeof product & {
      costPrice: number | null;
      commissionRate: number | null;
      cargoCost: number | null;
      targetProfitRate: number | null;
    };

    const anyPrisma = prisma as any;
    const tierRows: PricingTierLike[] =
      anyPrisma.pricingTier && typeof anyPrisma.pricingTier.findMany === "function"
        ? await anyPrisma.pricingTier.findMany({ where: { storeId: ctx.storeId, isActive: true } })
        : [];

    const settings = await getUserSettings({ userId: ctx.userId, storeId: ctx.storeId });

    const resolved = resolveEffectivePricingInputs({
      costPrice: p.costPrice,
      productOverrides: {
        commissionRate: p.commissionRate,
        cargoCost: p.cargoCost,
        targetProfitRate: p.targetProfitRate
      },
      storeDefaults: {
        commissionRate: settings.defaultCommissionRate,
        cargoCost: settings.defaultCargoCost,
        targetProfitRate: settings.defaultTargetProfitRate
      },
      tiers: tierRows
    });

    return NextResponse.json({
      costPrice: p.costPrice,
      commissionRate: resolved.commissionRate,
      cargoCost: resolved.cargoCost,
      targetProfitRate: resolved.targetProfitRate,
      matchedTier: resolved.matchedTier
        ? {
            id: resolved.matchedTier.id,
            label: resolved.matchedTier.label ?? buildPricingTierLabel(resolved.matchedTier)
          }
        : null
    });
  } catch (error) {
    console.error("Pricing tier suggestion error:", error);
    return NextResponse.json(
      { error: "Fiyat aralığı önerisi alınırken hata oluştu." },
      { status: 500 }
    );
  }
}
