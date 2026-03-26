import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";

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

    if (!anyPrisma.userSettings || typeof anyPrisma.userSettings.findUnique !== "function") {
      return NextResponse.json({
        settings: null,
        message: "UserSettings modeli henüz mevcut değil. Migration yapın."
      });
    }

    const settings = await anyPrisma.userSettings.findUnique({
      where: { storeId: ctx.storeId }
    });

    if (!settings) {
      return NextResponse.json({
        settings: {
          companyName: "",
          defaultCurrency: "TRY",
          defaultVatRate: 20,
          defaultCommissionRate: null,
          defaultCargoCost: null,
          defaultTargetProfitRate: null,
          defaultDesi: 1,
          fallbackBrand: "",
          fallbackCategory: ""
        }
      });
    }

    return NextResponse.json({
      settings: {
        companyName: settings.companyName ?? "",
        defaultCurrency: settings.defaultCurrency ?? "TRY",
        defaultVatRate: settings.defaultVatRate ?? 20,
        defaultCommissionRate: settings.defaultCommissionRate,
        defaultCargoCost: settings.defaultCargoCost,
        defaultTargetProfitRate: settings.defaultTargetProfitRate,
        defaultDesi: settings.defaultDesi ?? 1,
        fallbackBrand: settings.fallbackBrand ?? "",
        fallbackCategory: settings.fallbackCategory ?? ""
      }
    });
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json(
      { error: "Ayarlar alınırken hata oluştu." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
    }

    const {
      companyName,
      defaultCurrency,
      defaultVatRate,
      defaultCommissionRate,
      defaultCargoCost,
      defaultTargetProfitRate,
      defaultDesi,
      fallbackBrand,
      fallbackCategory
    } = body;

    const anyPrisma = prisma as any;

    if (!anyPrisma.userSettings || typeof anyPrisma.userSettings.upsert !== "function") {
      return NextResponse.json(
        { error: "UserSettings modeli henüz mevcut değil. Migration yapın: npx prisma migrate dev --name add_user_settings" },
        { status: 500 }
      );
    }

    const data = {
      companyName: companyName || null,
      defaultCurrency: defaultCurrency || "TRY",
      defaultVatRate: typeof defaultVatRate === "number" ? defaultVatRate : 20,
      defaultCommissionRate: typeof defaultCommissionRate === "number" ? defaultCommissionRate : null,
      defaultCargoCost: typeof defaultCargoCost === "number" ? defaultCargoCost : null,
      defaultTargetProfitRate: typeof defaultTargetProfitRate === "number" ? defaultTargetProfitRate : null,
      defaultDesi: typeof defaultDesi === "number" ? defaultDesi : 1,
      fallbackBrand: fallbackBrand || null,
      fallbackCategory: fallbackCategory || null
    };

    await anyPrisma.userSettings.upsert({
      where: { storeId: ctx.storeId },
      update: data,
      create: {
        userId: ctx.userId,
        storeId: ctx.storeId,
        ...data
      }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "settings_updated",
      entityType: "settings",
      entityId: null,
      message: "Kullanıcı ayarları güncellendi"
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save settings error:", error);
    return NextResponse.json(
      { error: "Ayarlar kaydedilirken hata oluştu." },
      { status: 500 }
    );
  }
}
