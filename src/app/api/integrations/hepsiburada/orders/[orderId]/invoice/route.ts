import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { sendHbInvoiceLink, extractHbPackageNumber } from "@/lib/hepsiburadaOrderActions";

// NOT: invoice-link endpoint'inin tam path/body şekli HB resmi dokümantasyonunda
// DOĞRULANAMADI — bkz. hepsiburadaOrderActions.ts dosya başı notu. Kullanmadan
// önce HB entegrasyon ekibiyle teyit edilmesi önerilir.

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    let ctx;
    try {
      ctx = await requireActiveStore();
    } catch (e: any) {
      return NextResponse.json({ error: e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz." }, { status: 401 });
    }
    
    try {
      requirePermission(ctx, "marketplace.integrations.manage");
    } catch {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    const { invoiceUrl, invoiceNumber, invoiceDate } = await req.json();
    if (!invoiceUrl) {
      return NextResponse.json({ error: "Fatura URL (invoiceUrl) parametresi zorunludur." }, { status: 400 });
    }

    const order = await prisma.marketplaceOrder.findFirst({
      where: { id: params.orderId, storeId: ctx.storeId, platform: "hepsiburada" },
      select: { id: true, shipmentPackageId: true, orderNumber: true, rawData: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
    }

    const result = await sendHbInvoiceLink({
      storeId: ctx.storeId,
      packageNumber: extractHbPackageNumber(order),
      payload: {
        invoiceUrl,
        invoiceNumber: invoiceNumber ?? order.orderNumber,
        invoiceDate,
      },
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error: any) {
    console.error("Hepsiburada order invoice send error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
