import { NextResponse } from "next/server";
import { runTrendyolProductPublishPipeline } from "@/lib/trendyolPublishProductPipeline";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.publish");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const result = await runTrendyolProductPublishPipeline({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    productId: params.id,
    contentRepublishMode: false
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        missing: result.missing,
        ready: result.missing ? false : undefined
      },
      { status: result.httpStatus }
    );
  }

  return NextResponse.json({
    success: true,
    publishStatus: result.publishStatus,
    batchRequestId: result.batchRequestId,
    message: "Ürün Trendyol'a iletildi. Onay durumu için batch sonucunu kontrol edin."
  });
}
