import { NextResponse } from "next/server";
import { runTrendyolProductContentUpdatePipeline } from "@/lib/trendyolPublishProductPipeline";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { applyPublishPipelineResultToProductMarketplaceSync } from "@/lib/xml-sync/applyManualProductMarketplaceSync";
import { MarketplaceSyncSource } from "@/lib/xml-sync/types";

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

  const result = await runTrendyolProductContentUpdatePipeline({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    productId: params.id
  });

  await applyPublishPipelineResultToProductMarketplaceSync({
    productId: params.id,
    storeId: ctx.storeId,
    userId: ctx.userId,
    membershipId: ctx.membershipId,
    result,
    source: MarketplaceSyncSource.MANUAL_CONTENT_UPDATE
  });

  if (!result.ok) {
    const b = result.batch;
    return NextResponse.json(
      {
        accepted: false,
        error: result.error,
        missing: result.missing,
        ready: result.missing ? false : undefined,
        total: b?.total ?? 0,
        success: b?.success ?? 0,
        failed: b?.failed ?? 0,
        pending: b?.pending ?? 0,
        results: b?.results ?? []
      },
      { status: result.httpStatus }
    );
  }

  return NextResponse.json({
    accepted: true,
    publishStatus: result.publishStatus,
    batchRequestId: result.batchRequestId,
    message: result.message,
    total: result.batch.total,
    success: result.batch.success,
    failed: result.batch.failed,
    pending: result.batch.pending,
    results: result.batch.results
  });
}
