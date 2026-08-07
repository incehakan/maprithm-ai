import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

const VALID_STRATEGIES = new Set(["undercut_amount", "undercut_percent", "match_buybox"]);

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
    if (!anyPrisma.buyboxRepricingSettings) {
      return NextResponse.json({
        settings: {
          isActive: false,
          strategy: "undercut_amount",
          undercutValue: 1,
          minMarginPct: null
        }
      });
    }
    const settings = await anyPrisma.buyboxRepricingSettings.findUnique({
      where: { storeId: ctx.storeId }
    });
    return NextResponse.json({
      settings: settings
        ? {
            isActive: settings.isActive,
            strategy: settings.strategy,
            undercutValue: settings.undercutValue,
            minMarginPct: settings.minMarginPct
          }
        : { isActive: false, strategy: "undercut_amount", undercutValue: 1, minMarginPct: null }
    });
  } catch (error) {
    console.error("Get buybox repricing settings error:", error);
    return NextResponse.json({ error: "Ayarlar alınırken hata oluştu." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });

    const strategy = VALID_STRATEGIES.has(body.strategy) ? body.strategy : "undercut_amount";
    const undercutValue =
      typeof body.undercutValue === "number" && Number.isFinite(body.undercutValue) && body.undercutValue >= 0
        ? body.undercutValue
        : 1;
    const minMarginPct =
      body.minMarginPct != null && Number.isFinite(Number(body.minMarginPct))
        ? Number(body.minMarginPct)
        : null;
    const isActive = body.isActive === true;

    const anyPrisma = prisma as any;
    if (!anyPrisma.buyboxRepricingSettings) {
      return NextResponse.json(
        { error: "BuyboxRepricingSettings modeli henüz mevcut değil. Migration yapın." },
        { status: 500 }
      );
    }

    const saved = await anyPrisma.buyboxRepricingSettings.upsert({
      where: { storeId: ctx.storeId },
      update: { isActive, strategy, undercutValue, minMarginPct },
      create: { storeId: ctx.storeId, isActive, strategy, undercutValue, minMarginPct }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "BUYBOX_REPRICING_SETTINGS_UPDATED",
      entityType: "store",
      entityId: ctx.storeId,
      message: `Buybox otomatik fiyatlandırma ayarları güncellendi: aktif=${isActive}, strateji=${strategy}, değer=${undercutValue}${minMarginPct != null ? `, min marj=%${minMarginPct}` : ""}.`
    });

    return NextResponse.json({
      settings: {
        isActive: saved.isActive,
        strategy: saved.strategy,
        undercutValue: saved.undercutValue,
        minMarginPct: saved.minMarginPct
      }
    });
  } catch (error) {
    console.error("Update buybox repricing settings error:", error);
    return NextResponse.json({ error: "Ayarlar kaydedilirken hata oluştu." }, { status: 500 });
  }
}
