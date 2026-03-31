import { NextResponse } from "next/server";
import { runTrendyolProductDeleteFromPlatform } from "@/lib/trendyolPublishProductPipeline";
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

  const result = await runTrendyolProductDeleteFromPlatform({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    productId: params.id
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.httpStatus }
    );
  }

  return NextResponse.json({
    success: true,
    publishStatus: result.publishStatus,
    batchRequestId: result.batchRequestId,
    message:
      "Trendyol ürün silme isteği kuyruğa alındı. Sonucu batch işlerinden takip edin."
  });
}
