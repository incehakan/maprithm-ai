import { NextResponse } from "next/server";
import { logAndBuildApiError } from "@/lib/errorHandling";
import { getRequestId } from "@/lib/requestContext";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  filterTrendyolCustomerQuestions,
  parseCustomerQuestionsQueryFromSearchParams
} from "@/lib/trendyolCustomerQuestions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 401 });
  }
  try {
    requirePermission(ctx, "trendyol.questions.view");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = parseCustomerQuestionsQueryFromSearchParams(
    Object.fromEntries(url.searchParams.entries())
  );

  try {
    const res = await filterTrendyolCustomerQuestions({
      userId: ctx.userId,
      storeId: ctx.storeId,
      query,
      requestId
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.message, requestId },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }
    return NextResponse.json({ success: true, data: res.data, requestId });
  } catch (err) {
    const payload = logAndBuildApiError({
      err,
      fallbackMessage: "Müşteri soruları alınamadı.",
      requestId,
      context: { route: "/api/integrations/trendyol/customer-questions", storeId: ctx.storeId, userId: ctx.userId }
    });
    return NextResponse.json({ ...payload, requestId }, { status: 500 });
  }
}
