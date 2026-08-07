import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { createActivityLog } from "@/lib/activityLog";
import { runTrendyolProductPublishPipeline } from "@/lib/trendyolPublishProductPipeline";
import { createErrorResponse, jsonError } from "@/lib/errors/errorResponse";

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
    requirePermission(ctx, "products.update");
  } catch (e: unknown) {
    const noStore = e instanceof Error && e.message === "NO_ACTIVE_STORE";
    const forbidden = e instanceof Error && e.message === "FORBIDDEN";
    if (forbidden) return jsonError("FORBIDDEN", { httpStatus: 403 });
    return noStore
      ? jsonError("NO_ACTIVE_STORE", { httpStatus: 401 })
      : jsonError("UNAUTHORIZED", { httpStatus: 401 });
  }
  const { userId, storeId, membershipId } = ctx;

  try {
    const body = await request.json().catch(() => null);
    const productIds = body?.productIds;
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return jsonError("VALIDATION_ERROR", {
        userMessage: "En az bir ürün seçin.",
        field: "productIds",
        httpStatus: 400
      });
    }

    const ids = productIds.filter((id: unknown) => typeof id === "string").slice(0, 200);
    const results: { productId: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const productId of ids) {
      try {
        const res = await runTrendyolProductPublishPipeline({
          userId,
          storeId,
          membershipId,
          productId,
          skipActivityLog: true
        });
        if (res.ok) {
          results.push({ productId, success: true });
          successCount++;
        } else {
          results.push({ productId, success: false, error: res.error });
          errorCount++;
        }
      } catch (err) {
        console.error("Bulk publish error for product", productId, err);
        results.push({
          productId,
          success: false,
          error: err instanceof Error ? err.message : "Beklenmeyen hata."
        });
        errorCount++;
      }
    }

    await createActivityLog({
      userId,
      storeId,
      membershipId,
      action: "BULK_TRENDYOL_PUBLISH",
      entityType: "product",
      entityId: null,
      message: `Toplu Trendyol gönderimi: ${successCount} başarılı, ${errorCount} hatalı (toplam ${ids.length}).`
    });

    return NextResponse.json({
      successCount,
      errorCount,
      total: ids.length,
      results
    });
  } catch (error) {
    console.error("Bulk publish products error:", error);
    return createErrorResponse(error, {
      route: "POST /api/products/bulk-publish-trendyol"
    });
  }
}
