import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  validatePricingTierInput,
  pricingTierOverlaps,
  buildPricingTierLabel,
  type PricingTierLike
} from "@/lib/pricingTiers";

function toFloat(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    const anyPrisma = prisma as any;
    if (!anyPrisma.pricingTier || typeof anyPrisma.pricingTier.findMany !== "function") {
      return NextResponse.json({
        tiers: [],
        message:
          "PricingTier modeli henüz mevcut değil. Migration yapın: npx prisma migrate dev --name add_pricing_tiers"
      });
    }

    const tiers = await anyPrisma.pricingTier.findMany({
      where: { storeId: ctx.storeId },
      orderBy: [{ minCostPrice: "asc" }]
    });

    return NextResponse.json({
      tiers: tiers.map((t: any) => ({
        id: t.id,
        label: t.label ?? buildPricingTierLabel(t),
        minCostPrice: t.minCostPrice,
        maxCostPrice: t.maxCostPrice,
        commissionRate: t.commissionRate,
        cargoCost: t.cargoCost,
        targetProfitRate: t.targetProfitRate,
        isActive: t.isActive
      }))
    });
  } catch (error) {
    console.error("Get pricing tiers error:", error);
    return NextResponse.json(
      { error: "Fiyat aralıkları alınırken hata oluştu." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
    requirePermission(ctx, "store.settings.manage");
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
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
    }

    const input = {
      label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : null,
      minCostPrice: toFloat(body.minCostPrice) ?? NaN,
      maxCostPrice: toFloat(body.maxCostPrice),
      commissionRate: toFloat(body.commissionRate) ?? NaN,
      cargoCost: toFloat(body.cargoCost) ?? NaN,
      targetProfitRate: toFloat(body.targetProfitRate) ?? NaN,
      isActive: body.isActive !== false
    };

    const validationError = validatePricingTierInput(input);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const anyPrisma = prisma as any;
    if (!anyPrisma.pricingTier || typeof anyPrisma.pricingTier.create !== "function") {
      return NextResponse.json(
        {
          error:
            "PricingTier modeli henüz mevcut değil. Migration yapın: npx prisma migrate dev --name add_pricing_tiers"
        },
        { status: 500 }
      );
    }

    const existing: PricingTierLike[] = await anyPrisma.pricingTier.findMany({
      where: { storeId: ctx.storeId }
    });

    const overlap = pricingTierOverlaps(input, existing);
    if (overlap) {
      return NextResponse.json(
        {
          error: `Bu aralık, mevcut "${overlap.label ?? buildPricingTierLabel(overlap)}" aralığıyla çakışıyor. Önce onu düzenleyin veya pasife alın.`
        },
        { status: 400 }
      );
    }

    const created = await anyPrisma.pricingTier.create({
      data: {
        storeId: ctx.storeId,
        label: input.label,
        minCostPrice: input.minCostPrice,
        maxCostPrice: input.maxCostPrice,
        commissionRate: input.commissionRate,
        cargoCost: input.cargoCost,
        targetProfitRate: input.targetProfitRate,
        isActive: input.isActive
      }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "PRICING_TIER_CREATED",
      entityType: "pricing_tier",
      entityId: created.id,
      message: `Fiyat aralığı oluşturuldu: ${input.label ?? buildPricingTierLabel(input)}`
    });

    return NextResponse.json({ tier: created });
  } catch (error) {
    console.error("Create pricing tier error:", error);
    return NextResponse.json(
      { error: "Fiyat aralığı oluşturulurken hata oluştu." },
      { status: 500 }
    );
  }
}
