import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { validatePublishRuleInput } from "@/lib/publishRules";

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toFloatOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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
    if (!anyPrisma.marketplacePublishRule || typeof anyPrisma.marketplacePublishRule.findUnique !== "function") {
      return NextResponse.json({
        rule: null,
        message: "MarketplacePublishRule modeli henüz mevcut değil. Migration yapın."
      });
    }

    const rule = await anyPrisma.marketplacePublishRule.findUnique({
      where: { storeId: ctx.storeId }
    });

    return NextResponse.json({
      rule: rule
        ? {
            minStock: rule.minStock,
            minPrice: rule.minPrice,
            maxPrice: rule.maxPrice,
            isActive: rule.isActive
          }
        : { minStock: null, minPrice: null, maxPrice: null, isActive: false }
    });
  } catch (error) {
    console.error("Get publish rule error:", error);
    return NextResponse.json({ error: "Kural alınırken hata oluştu." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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
      minStock: toIntOrNull(body.minStock),
      minPrice: toFloatOrNull(body.minPrice),
      maxPrice: toFloatOrNull(body.maxPrice),
      isActive: body.isActive !== false
    };

    const validationError = validatePublishRuleInput(input);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const anyPrisma = prisma as any;
    if (!anyPrisma.marketplacePublishRule || typeof anyPrisma.marketplacePublishRule.upsert !== "function") {
      return NextResponse.json(
        { error: "MarketplacePublishRule modeli henüz mevcut değil. Migration yapın." },
        { status: 500 }
      );
    }

    const saved = await anyPrisma.marketplacePublishRule.upsert({
      where: { storeId: ctx.storeId },
      update: input,
      create: { storeId: ctx.storeId, ...input }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "PUBLISH_RULE_UPDATED",
      entityType: "store",
      entityId: ctx.storeId,
      message: `Yayın kısıtlama kuralı güncellendi: minStock=${input.minStock ?? "-"}, minPrice=${input.minPrice ?? "-"}, maxPrice=${input.maxPrice ?? "-"}, aktif=${input.isActive}`
    });

    return NextResponse.json({
      rule: {
        minStock: saved.minStock,
        minPrice: saved.minPrice,
        maxPrice: saved.maxPrice,
        isActive: saved.isActive
      }
    });
  } catch (error) {
    console.error("Update publish rule error:", error);
    return NextResponse.json({ error: "Kural kaydedilirken hata oluştu." }, { status: 500 });
  }
}
