import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { enqueueOrderSyncJob } from "@/lib/trendyolOrderBackgroundSync";
import { triggerOrderSyncProcessing } from "@/lib/trendyolOrderSyncTrigger";
import { logger } from "@/lib/logger";

/**
 * Mağaza siparişleri — generic MarketplaceOrder üzerinden.
 * Canlı çekim / senkron için POST; liste için GET.
 * (Eski sapigw stub kaldırıldı; bağlantı platformu: trendyol)
 */
export async function GET(request: Request) {
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
    requirePermission(ctx, "orders.view");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim() || undefined;
  const q = url.searchParams.get("q")?.trim() || undefined;
  const takeRaw = Number(url.searchParams.get("take") ?? "50");
  const take = Number.isFinite(takeRaw)
    ? Math.min(Math.max(Math.trunc(takeRaw), 1), 200)
    : 50;

  const orders = await prisma.marketplaceOrder.findMany({
    where: {
      storeId: ctx.storeId,
      platform: "trendyol",
      isTestRecord: false,
      ...(status ? { packageStatus: status } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: "insensitive" } },
              { shipmentPackageId: { contains: q, mode: "insensitive" } }
            ]
          }
        : {})
    },
    orderBy: { orderDate: "desc" },
    take,
    select: {
      id: true,
      orderNumber: true,
      rootOrderNumber: true,
      shipmentPackageId: true,
      packageStatus: true,
      cargoTrackingNumber: true,
      cargoProviderCode: true,
      cargoProviderName: true,
      cargoStatusText: true,
      totalPrice: true,
      currency: true,
      orderDate: true,
      invoiceStatus: true,
      invoiceNumber: true,
      invoiceLink: true,
      lastFetchedAt: true,
      lastIngestSource: true,
      shippingOperationStatus: true,
      _count: { select: { lines: true, invoices: true } }
    }
  });

  return NextResponse.json({
    success: true,
    count: orders.length,
    orders
  });
}

type SyncBody = {
  status?: unknown;
  orderByField?: unknown;
  orderByDirection?: unknown;
  full?: unknown;
};

/** Trendyol’dan sipariş çekip MarketplaceOrder’a yazar (kuyruk + arka plan). */
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

  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId: ctx.storeId, platform: "trendyol", isActive: true },
    select: { id: true, sellerId: true }
  });
  if (!conn?.sellerId?.trim()) {
    return NextResponse.json(
      { success: false, error: "Aktif Trendyol bağlantısı yok. Ayarlar → Trendyol Entegrasyonu." },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const statusFromQuery = url.searchParams.get("status");
  const body = (await request.json().catch(() => null)) as SyncBody | null;
  const statusFromBody =
    typeof body?.status === "string" ? body.status.trim() : "";
  const status = (statusFromQuery?.trim() || statusFromBody || undefined) as
    | string
    | undefined;
  const orderByField =
    typeof body?.orderByField === "string" ? body.orderByField.trim() : undefined;
  const orderByDirection =
    body?.orderByDirection === "ASC" || body?.orderByDirection === "DESC"
      ? body.orderByDirection
      : undefined;
  const fullSync = body?.full === true;

  try {
    const { job } = await enqueueOrderSyncJob({
      storeId: ctx.storeId,
      syncType: "manual",
      triggeredByUserId: ctx.userId,
      membershipId: ctx.membershipId,
      options: {
        status,
        orderByField,
        orderByDirection,
        pullKind: fullSync ? "full" : "incremental"
      }
    });

    await triggerOrderSyncProcessing(request.url);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Senkron kuyruğa alındı. Siparişler MarketplaceOrder tablosuna yazılacak."
    });
  } catch (err) {
    logger.error("integrations_trendyol_orders_sync_failed", {
      storeId: ctx.storeId,
      error: err instanceof Error ? err.message : String(err)
    });
    const message =
      err instanceof Error ? err.message : "Senkron kuyruğa alınamadı.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
