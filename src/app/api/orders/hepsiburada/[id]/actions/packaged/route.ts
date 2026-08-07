import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  sendHbPackagedAction,
  persistHbActionResult,
} from "@/lib/hepsiburadaOrderActions";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }
  try { requirePermission(ctx, "orders.manage"); } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: params.id, storeId: ctx.storeId, platform: "hepsiburada" },
    select: { id: true, shipmentPackageId: true },
  });
  if (!order) return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });

  const lines = await prisma.marketplaceOrderLine.findMany({
    where: { orderId: order.id, storeId: ctx.storeId },
    select: { lineId: true, quantity: true },
  });

  const body = await req.json().catch(() => ({})) as {
    cargoCompany?: string; // yalnızca mağaza hesabı modelinde "MP" gönderilmeli
    lineItems?: Array<{ id: string; quantity: number }>;
    parcelQuantity?: number;
    deci?: number;
  };

  const lineItems =
    body.lineItems ??
    lines.filter((l) => l.lineId).map((l) => ({ id: l.lineId as string, quantity: l.quantity }));

  const result = await sendHbPackagedAction({
    storeId: ctx.storeId,
    payload: {
      lineItems,
      cargoCompany: body.cargoCompany?.trim() || undefined,
      parcelQuantity: body.parcelQuantity,
      deci: body.deci,
    },
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: 502 });

  await persistHbActionResult({
    orderId: order.id,
    storeId: ctx.storeId,
    action: "packaged",
    sentStatus: result.sentStatus,
    trendyolData: result.trendyolData,
    labelUrl: result.labelUrl,
    trackingNumber: result.trackingNumber,
    cargoProviderName: body.cargoCompany?.trim() || null,
  });

  return NextResponse.json({
    success: true,
    packageStatus: result.sentStatus,
    labelUrl: result.labelUrl,
    trackingNumber: result.trackingNumber,
  });
}
