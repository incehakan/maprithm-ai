import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getHbProductsByMerchantAndStatus } from "@/lib/hepsiburadaProductApi";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

export async function GET(request: Request) {
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
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim();
    if (!status) {
      return jsonError("VALIDATION_ERROR", {
        userMessage: "status zorunludur.",
        httpStatus: 400,
      });
    }

    const taskStatusRaw = url.searchParams.get("taskStatus");
    const page = Number(url.searchParams.get("page") ?? "0");
    const size = Number(url.searchParams.get("size") ?? "50");

    const result = await getHbProductsByMerchantAndStatus(ctx.storeId, {
      status,
      taskStatus: taskStatusRaw === "true",
      page: Number.isFinite(page) ? page : 0,
      size: Number.isFinite(size) ? size : 50,
    });
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: 502,
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Hepsiburada products by-status GET error:", error);
    return createErrorResponse(error, {
      route: "GET /api/integrations/hepsiburada/products/by-status",
    });
  }
}
