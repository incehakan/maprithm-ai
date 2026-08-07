import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  sendHbCancelActionSafe,
  persistHbActionResult,
  extractHbPackageNumber,
} from "@/lib/hepsiburadaOrderActions";

type Params = { params: { id: string } };

// NOT: HB'de paket/sipariş bazlı bir "Cancel" aksiyonu yoktur — iptal KALEM
// bazlıdır (POST /lineitems/merchantid/{merchantId}/id/{lineItemId}/cancelbymerchant)
// ve yalnızca henüz paketlenmemiş ("Open") kalemler için geçerlidir. Bu route,
// body'de belirtilen kalemleri (veya body boşsa siparişin tüm satırlarını)
// tek tek iptal eder. reasonId zorunludur (HB enum kodu, örn. 83). Paket
// zaten oluşmuşsa sendHbCancelActionSafe önce otomatik unpack dener.

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
    select: { id: true, shipmentPackageId: true, rawData: true, packageStatus: true },
  });
  if (!order) return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    reasonId?: number;
    lineItemIds?: string[];
  };

  if (body.reasonId == null) {
    return NextResponse.json({ success: false, error: "reasonId zorunludur." }, { status: 400 });
  }

  let lineItemIds = body.lineItemIds;
  if (!lineItemIds || lineItemIds.length === 0) {
    const lines = await prisma.marketplaceOrderLine.findMany({
      where: { orderId: order.id, storeId: ctx.storeId },
      select: { lineId: true },
    });
    lineItemIds = lines.map((l) => l.lineId).filter((v): v is string => !!v);
  }

  if (lineItemIds.length === 0) {
    return NextResponse.json({ success: false, error: "İptal edilecek kalem bulunamadı." }, { status: 400 });
  }

  // Statü "Open" değilse (yani paket oluşmuşsa) unpack denemesi için
  // packageNumber'ı geçiyoruz; "Open" ise gereksiz bir unpack çağrısından
  // kaçınmak için geçmiyoruz.
  const isOpen = (order.packageStatus ?? "").trim().toLowerCase() === "open";
  const packageNumber = isOpen ? undefined : extractHbPackageNumber(order);

  const errors: string[] = [];
  let lastSentStatus = "Cancelled";
  let lastData: unknown = null;

  for (const lineItemId of lineItemIds) {
    const result = await sendHbCancelActionSafe({
      storeId: ctx.storeId,
      lineItemId,
      reasonId: body.reasonId,
      packageNumber,
    });
    if (!result.ok) {
      errors.push(`${lineItemId}: ${result.message}`);
      continue;
    }
    lastSentStatus = result.sentStatus;
    lastData = result.trendyolData;
  }

  if (errors.length === lineItemIds.length) {
    return NextResponse.json({ success: false, error: errors.join(" | ") }, { status: 502 });
  }

  await persistHbActionResult({
    orderId: order.id,
    storeId: ctx.storeId,
    action: "cancel",
    sentStatus: lastSentStatus,
    trendyolData: lastData,
  });

  if (errors.length > 0) {
    return NextResponse.json({
      success: true,
      packageStatus: lastSentStatus,
      partialErrors: errors,
    });
  }

  return NextResponse.json({ success: true, packageStatus: lastSentStatus });
}
