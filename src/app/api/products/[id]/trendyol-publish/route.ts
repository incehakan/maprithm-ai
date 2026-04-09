import { NextResponse } from "next/server";
import { runTrendyolProductPublishPipeline } from "@/lib/trendyolPublishProductPipeline";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { applyPublishPipelineResultToProductMarketplaceSync } from "@/lib/xml-sync/applyManualProductMarketplaceSync";
import { MarketplaceSyncSource } from "@/lib/xml-sync/types";
import { jsonError } from "@/lib/errors/errorResponse";
import { nextResponseFromPublishPipelineFailure } from "@/lib/errors/publishPipelineError";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const noStore = e?.message === "NO_ACTIVE_STORE";
    return noStore
      ? jsonError("NO_ACTIVE_STORE", { httpStatus: 401 })
      : jsonError("UNAUTHORIZED", { httpStatus: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.publish");
  } catch {
    return jsonError("FORBIDDEN", {
      userMessage: "Bu işlem için yetkiniz yok.",
      httpStatus: 403
    });
  }

  const result = await runTrendyolProductPublishPipeline({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    productId: params.id,
    contentRepublishMode: false
  });

  await applyPublishPipelineResultToProductMarketplaceSync({
    productId: params.id,
    storeId: ctx.storeId,
    userId: ctx.userId,
    membershipId: ctx.membershipId,
    result,
    source: MarketplaceSyncSource.MANUAL_PUBLISH
  });

  if (!result.ok) {
    return nextResponseFromPublishPipelineFailure(result, {
      route: "POST /api/products/[id]/trendyol-publish",
      userId: ctx.userId,
      storeId: ctx.storeId,
      productId: params.id
    });
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
