import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { FEATURE_FLAGS, type FeatureFlagKey } from "@/lib/featureFlags";

const KNOWN_FLAG_VALUES = new Set<string>(Object.values(FEATURE_FLAGS));

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    const store = await prisma.store.findUnique({
      where: { id: ctx.storeId },
      select: { featureFlags: true }
    });

    const flags =
      store?.featureFlags && typeof store.featureFlags === "object" && !Array.isArray(store.featureFlags)
        ? (store.featureFlags as Record<string, unknown>)
        : {};

    const result: Record<string, boolean> = {};
    for (const key of KNOWN_FLAG_VALUES) {
      result[key] = flags[key] === true;
    }

    return NextResponse.json({ flags: result });
  } catch (error) {
    console.error("Get feature flags error:", error);
    return NextResponse.json({ error: "Ayarlar alınırken hata oluştu." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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
    const key = body?.key as FeatureFlagKey | undefined;
    const value = body?.value;

    if (!key || !KNOWN_FLAG_VALUES.has(key)) {
      return NextResponse.json({ error: "Geçersiz veya bilinmeyen flag anahtarı." }, { status: 400 });
    }
    if (typeof value !== "boolean") {
      return NextResponse.json({ error: "'value' alanı boolean olmalı." }, { status: 400 });
    }

    const store = await prisma.store.findUnique({
      where: { id: ctx.storeId },
      select: { featureFlags: true }
    });

    const currentFlags =
      store?.featureFlags && typeof store.featureFlags === "object" && !Array.isArray(store.featureFlags)
        ? (store.featureFlags as Record<string, unknown>)
        : {};

    const nextFlags = { ...currentFlags, [key]: value };

    await prisma.store.update({
      where: { id: ctx.storeId },
      data: { featureFlags: nextFlags as any }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "FEATURE_FLAG_UPDATED",
      entityType: "store",
      entityId: ctx.storeId,
      message: `Feature flag güncellendi: ${key} = ${value}`
    });

    return NextResponse.json({ success: true, flags: { ...currentFlags, [key]: value } });
  } catch (error) {
    console.error("Update feature flag error:", error);
    return NextResponse.json({ error: "Ayar kaydedilirken hata oluştu." }, { status: 500 });
  }
}
