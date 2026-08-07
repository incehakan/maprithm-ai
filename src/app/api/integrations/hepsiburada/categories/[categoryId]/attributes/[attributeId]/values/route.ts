import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { fetchHbAttributeValues } from "@/lib/hepsiburadaProductApi";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

export async function GET(
  request: Request,
  { params }: { params: { categoryId: string; attributeId: string } }
) {
  let ctx;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const noStore = e instanceof Error && e.message === "NO_ACTIVE_STORE";
    return noStore
      ? jsonError("NO_ACTIVE_STORE", { httpStatus: 401 })
      : jsonError("UNAUTHORIZED", { httpStatus: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch {
    return jsonError("FORBIDDEN", { httpStatus: 403 });
  }

  try {
    const result = await fetchHbAttributeValues(
      ctx.storeId,
      params.categoryId,
      params.attributeId
    );
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: 502,
      });
    }

    return NextResponse.json({
      success: true,
      data: result.values,
      totalCount: result.totalCount,
    });
  } catch (error) {
    console.error("Hepsiburada attribute values GET error:", error);
    return createErrorResponse(error, {
      route:
        "GET /api/integrations/hepsiburada/categories/[categoryId]/attributes/[attributeId]/values",
    });
  }
}
