import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  updatePackageStatus,
  type TrendyolPackageActionPayload
} from "@/lib/trendyolOrderActions";
import { matchOrderCargoProvider } from "@/lib/trendyolCarrier";
import { Prisma } from "@prisma/client";
import {
  logOrderOperationCompleted,
  logOrderOperationFailed,
  logOrderOperationStarted
} from "@/lib/trendyolOrderOperationLog";
import { secureMarketplaceOrderUpdateMany } from "@/lib/security/storeScope";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
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

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: params.id, storeId: ctx.storeId, isTestRecord: false },
    select: {
      id: true,
      shipmentPackageId: true,
      cargoTrackingNumber: true,
      cargoProviderCode: true,
      cargoProviderName: true
    }
  });
  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        trackingNumber?: unknown;
        providerCode?: unknown;
        cargoProviderCode?: unknown;
        cargoProviderName?: unknown;
      }
    | null;

  const trackingNumber =
    typeof body?.trackingNumber === "string"
      ? body.trackingNumber.trim()
      : order.cargoTrackingNumber ?? "";

  const rawCode =
    (typeof body?.providerCode === "string" && body.providerCode.trim()) ||
    (typeof body?.cargoProviderCode === "string" && body.cargoProviderCode.trim()) ||
    order.cargoProviderCode?.trim() ||
    "";

  const rawName =
    (typeof body?.cargoProviderName === "string" && body.cargoProviderName.trim()) ||
    order.cargoProviderName?.trim() ||
    null;

  if (!trackingNumber) {
    return NextResponse.json(
      { success: false, error: "trackingNumber zorunludur." },
      { status: 400 }
    );
  }

  const matched = await matchOrderCargoProvider({
    storeId: ctx.storeId,
    providerCode: rawCode || null,
    providerName: rawName
  });

  const providerCode = matched.providerCode || rawCode;
  if (!providerCode) {
    return NextResponse.json(
      {
        success: false,
        error:
          "providerCode zorunludur (örn. YKMP). Siparişte kargo kodu yoksa gövdede gönderin."
      },
      { status: 400 }
    );
  }

  const displayName = matched.providerName || rawName || providerCode;

  const payload: TrendyolPackageActionPayload = {
    trackingNumber,
    providerCode,
    cargoProviderName: displayName
  };
  const status = "Shipped" as const;

  await logOrderOperationStarted(
    ctx,
    order.id,
    order.shipmentPackageId,
    "Shipped",
    payload
  );

  try {
    const result = await updatePackageStatus(
      ctx.userId,
      ctx.storeId,
      order.shipmentPackageId,
      status,
      payload
    );

    await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
      packageStatus: result.sentStatus,
      lastFetchedAt: new Date(),
      cargoTrackingNumber: trackingNumber,
      cargoProviderCode: providerCode,
      cargoProviderName: displayName,
      lastIngestSource: "operation"
    });

    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        action: "TRENDYOL_PACKAGE_SYNCED",
        message: `Paket durumu güncellendi: ${result.sentStatus}`,
        previousStatus: null,
        nextStatus: result.sentStatus,
        relatedShipmentPackageId: order.shipmentPackageId,
        rawData: (result.trendyolData ?? Prisma.JsonNull) as Prisma.InputJsonValue
      }
    });
    await logOrderOperationCompleted(ctx, order.id, "Shipped", result.trendyolData);

    return NextResponse.json({
      success: true,
      packageStatus: result.sentStatus,
      providerCode,
      cargoProviderName: displayName
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trendyol aksiyonu başarısız.";
    await logOrderOperationFailed(ctx, order.id, "Shipped", message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
