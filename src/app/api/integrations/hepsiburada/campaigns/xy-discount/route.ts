import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  createHbXyDiscount,
  type HbXyDiscountRequest,
} from "@/lib/hepsiburadaCampaigns";
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
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch {
    return jsonError("FORBIDDEN", { httpStatus: 403 });
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | (HbXyDiscountRequest & { iterationCount?: number })
      | null;
    if (!body?.name?.trim() || !body.startDate || !body.endDate) {
      return jsonError("VALIDATION_ERROR", {
        userMessage: "name, startDate, endDate zorunludur.",
        httpStatus: 400,
      });
    }
    if (body.IterationCount == null && body.iterationCount != null) {
      body.IterationCount = body.iterationCount;
    }

    const result = await createHbXyDiscount(ctx.storeId, body);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: result.status === 401 ? 401 : 502,
      });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("HB campaigns xy-discount POST error:", error);
    return createErrorResponse(error, {
      route: "POST /api/integrations/hepsiburada/campaigns/xy-discount",
    });
  }
}
