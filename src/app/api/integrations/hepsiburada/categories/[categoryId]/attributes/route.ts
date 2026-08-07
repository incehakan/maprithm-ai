import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { fetchHbCategoryAttributes } from "@/lib/hepsiburadaProductApi";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

export async function GET(
  request: Request,
  { params }: { params: { categoryId: string } }
) {
  let ctx;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const noStore = e?.message === "NO_ACTIVE_STORE";
    return noStore
      ? jsonError("NO_ACTIVE_STORE", { httpStatus: 401 })
      : jsonError("UNAUTHORIZED", { httpStatus: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch (e: any) {
    return jsonError("FORBIDDEN", { httpStatus: 403 });
  }

  try {
    const result = await fetchHbCategoryAttributes(ctx.storeId, params.categoryId);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: 502,
      });
    }

    return NextResponse.json({ success: true, data: result.attributes });
  } catch (error) {
    console.error("Hepsiburada category attributes GET error:", error);
    return createErrorResponse(error, {
      route: "GET /api/integrations/hepsiburada/categories/[categoryId]/attributes",
    });
  }
}
