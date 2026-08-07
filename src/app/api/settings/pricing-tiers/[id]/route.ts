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

type Params = { params: { id: string } };

function toFloat(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function getCtxOrError() {
  try {
    const ctx = await requireActiveStore();
    requirePermission(ctx, "store.settings.manage");
    return { ctx, error: null as null };
  } catch (e: any) {
    const msg =
      e?.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : e?.message === "FORBIDDEN"
          ? "Bu işlem için yetkiniz yok."
          : "Yetkisiz.";
    return {
      ctx: null,
      error: NextResponse.json({ error: msg }, { status: e?.message === "FORBIDDEN" ? 403 : 401 })
    };
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { ctx, error } = await getCtxOrError();
  if (error) return error;

  try {
    const anyPrisma = prisma as any;
    if (!anyPrisma.pricingTier || typeof anyPrisma.pricingTier.findFirst !== "function") {
      return NextResponse.json(
        { error: "PricingTier modeli henüz mevcut değil." },
        { status: 500 }
      );
    }

    const existingTier = await anyPrisma.pricingTier.findFirst({
      where: { id: params.id, storeId: ctx!.storeId }
    });
    if (!existingTier) {
      return NextResponse.json({ error: "Fiyat aralığı bulunamadı." }, { status: 404 });
    }

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

    const allOthers: PricingTierLike[] = await anyPrisma.pricingTier.findMany({
      where: { storeId: ctx!.storeId }
    });

    const overlap = input.isActive
      ? pricingTierOverlaps(input, allOthers, params.id)
      : null;
    if (overlap) {
      return NextResponse.json(
        {
          error: `Bu aralık, mevcut "${overlap.label ?? buildPricingTierLabel(overlap)}" aralığıyla çakışıyor.`
        },
        { status: 400 }
      );
    }

    const updated = await anyPrisma.pricingTier.update({
      where: { id: params.id },
      data: {
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
      userId: ctx!.userId,
      storeId: ctx!.storeId,
      membershipId: ctx!.membershipId,
      action: "PRICING_TIER_UPDATED",
      entityType: "pricing_tier",
      entityId: params.id,
      message: `Fiyat aralığı güncellendi: ${input.label ?? buildPricingTierLabel(input)}`
    });

    return NextResponse.json({ tier: updated });
  } catch (error) {
    console.error("Update pricing tier error:", error);
    return NextResponse.json(
      { error: "Fiyat aralığı güncellenirken hata oluştu." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { ctx, error } = await getCtxOrError();
  if (error) return error;

  try {
    const anyPrisma = prisma as any;
    if (!anyPrisma.pricingTier || typeof anyPrisma.pricingTier.deleteMany !== "function") {
      return NextResponse.json(
        { error: "PricingTier modeli henüz mevcut değil." },
        { status: 500 }
      );
    }

    const result = await anyPrisma.pricingTier.deleteMany({
      where: { id: params.id, storeId: ctx!.storeId }
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Fiyat aralığı bulunamadı." }, { status: 404 });
    }

    await createActivityLog({
      userId: ctx!.userId,
      storeId: ctx!.storeId,
      membershipId: ctx!.membershipId,
      action: "PRICING_TIER_DELETED",
      entityType: "pricing_tier",
      entityId: params.id,
      message: "Fiyat aralığı silindi."
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete pricing tier error:", error);
    return NextResponse.json(
      { error: "Fiyat aralığı silinirken hata oluştu." },
      { status: 500 }
    );
  }
}
