import { NextResponse } from "next/server";
import { getRequestId } from "@/lib/requestContext";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getTrendyolCustomerQuestionById } from "@/lib/trendyolCustomerQuestions";
import { logAndBuildApiError } from "@/lib/errorHandling";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;

  try {
    const res = await getTrendyolCustomerQuestionById({
      userId: ctx.userId,
      storeId: ctx.storeId,
      questionId: id,
      requestId
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.message, requestId },
        { status: res.status === 404 ? 404 : res.status >= 400 ? res.status : 502 }
      );
    }
    return NextResponse.json({ success: true, data: res.data, requestId });
  } catch (err) {
    const payload = logAndBuildApiError({
      err,
      fallbackMessage: "Soru detayı alınamadı.",
      requestId,
      context: { route: "/api/integrations/trendyol/customer-questions/[id]", storeId: ctx.storeId, userId: ctx.userId }
    });
    return NextResponse.json({ ...payload, requestId }, { status: 500 });
  }
}
