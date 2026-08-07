import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  importHbProducts,
  type HbProductImportItem,
} from "@/lib/hepsiburadaProductApi";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

export async function POST(request: Request) {
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
    requirePermission(ctx, "marketplace.publish");
  } catch {
    return jsonError("FORBIDDEN", { httpStatus: 403 });
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { items?: HbProductImportItem[] }
      | null;
    const items = Array.isArray(body?.items) ? body!.items! : [];
    if (!items.length) {
      return jsonError("VALIDATION_ERROR", {
        userMessage: "items dizisi zorunludur.",
        httpStatus: 400,
      });
    }

    const result = await importHbProducts(ctx.storeId, items);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: result.status >= 400 && result.status < 600 ? result.status : 502,
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Hepsiburada products import POST error:", error);
    return createErrorResponse(error, {
      route: "POST /api/integrations/hepsiburada/products/import",
    });
  }
}
