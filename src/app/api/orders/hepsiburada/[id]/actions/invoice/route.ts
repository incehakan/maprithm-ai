/**
 * POST /api/orders/hepsiburada/[id]/actions/invoice
 * Fatura linki — sendHbInvoiceLink (path: .../invoice, SIT 03.08.2026).
 * Body: { invoiceNumber, invoiceUrl, invoiceDate? }
 * Not: body alan adları hâlâ teyit bekliyor (bkz. DOGRULAMA_BEKLEYEN).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  sendHbInvoiceLink,
  extractHbPackageNumber,
} from "@/lib/hepsiburadaOrderActions";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
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

  const body = (await req.json().catch(() => null)) as {
    invoiceNumber?: string;
    invoiceUrl?: string;
    invoiceDate?: string;
  } | null;

  if (!body?.invoiceNumber?.trim() || !body?.invoiceUrl?.trim()) {
    return NextResponse.json(
      { success: false, error: "invoiceNumber ve invoiceUrl zorunludur." },
      { status: 400 }
    );
  }

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: params.id, storeId: ctx.storeId, platform: "hepsiburada" },
    select: { id: true, shipmentPackageId: true, rawData: true },
  });
  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
  }

  const packageNumber = extractHbPackageNumber(order);
  const result = await sendHbInvoiceLink({
    storeId: ctx.storeId,
    packageNumber,
    payload: {
      invoiceNumber: body.invoiceNumber.trim(),
      invoiceUrl: body.invoiceUrl.trim(),
      invoiceDate: body.invoiceDate?.trim() || undefined,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.message }, { status: 502 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
