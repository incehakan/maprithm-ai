import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { syncTrendyolOrdersForStore } from "@/lib/trendyolOrderSync";

type Body = {
  status?: unknown;
};

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "orders.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusFromQuery = url.searchParams.get("status");

  const body = (await request.json().catch(() => null)) as Body | null;
  const statusFromBody =
    typeof body?.status === "string" ? body.status.trim() : "";
  const status = (statusFromQuery?.trim() || statusFromBody || undefined) as
    | string
    | undefined;

  const anyPrisma = prisma as unknown as {
    marketplaceOrder?: unknown;
    marketplaceOrderEvent?: { create: (...args: unknown[]) => Promise<unknown> };
  };
  if (!anyPrisma.marketplaceOrder || !anyPrisma.marketplaceOrderEvent) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Sipariş modelleri henüz Prisma client'a yüklenmedi. `npx prisma generate` ve sunucu yeniden başlatma gerekli."
      },
      { status: 503 }
    );
  }

  try {
    const result = await syncTrendyolOrdersForStore({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      status
    });

    return NextResponse.json({
      success: true,
      upsertedPackages: result.upsertedPackages
    });
  } catch (err) {
    console.error("Trendyol order sync failed", err);
    const message =
      err instanceof Error ? err.message : "Trendyol sipariş senkronu başarısız.";

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_ORDER_SYNC_FAILED",
      entityType: "marketplace_order",
      message
    });

    try {
      await anyPrisma.marketplaceOrderEvent.create({
        data: {
          storeId: ctx.storeId,
          orderId: null,
          action: "TRENDYOL_ORDER_SYNC_FAILED",
          message
        }
      });
    } catch {
      // ignore
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    );
  }
}
