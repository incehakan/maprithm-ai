import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { pushPriceStockUpdateToTrendyol } from "@/lib/trendyolPriceStockPush";

type Body = { productId?: string };

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "pricing.update");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const productId = body?.productId?.trim() ?? "";
  if (!productId) {
    return NextResponse.json({ error: "Geçersiz ürün kimliği." }, { status: 400 });
  }

  const result = await pushPriceStockUpdateToTrendyol({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    productId
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    batchRequestId: result.batchRequestId,
    payloadPreview: {
      salePrice: result.salePrice,
      listPrice: result.listPrice,
      quantity: result.quantity
    },
    message: "Fiyat/stok güncellemesi Trendyol'a gönderildi."
  });
}
