import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { getRequestId } from "@/lib/requestContext";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { answerTrendyolCustomerQuestion } from "@/lib/trendyolCustomerQuestions";
import { logAndBuildApiError } from "@/lib/errorHandling";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
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
    requirePermission(ctx, "trendyol.questions.answer");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 10 || text.length > 2000) {
    return NextResponse.json(
      {
        success: false,
        error: "Cevap metni 10–2000 karakter arasında olmalıdır (Trendyol API).",
        requestId
      },
      { status: 400 }
    );
  }

  try {
    const res = await answerTrendyolCustomerQuestion({
      userId: ctx.userId,
      storeId: ctx.storeId,
      questionId: id,
      text,
      requestId
    });
    if (!res.ok) {
      logger.error("trendyol_customer_question_failed", {
        route: "/api/integrations/trendyol/customer-questions/[id]/answer",
        requestId,
        storeId: ctx.storeId,
        userId: ctx.userId,
        membershipId: ctx.membershipId,
        questionId: id,
        error: res.message
      });
      await createActivityLog({
        userId: ctx.userId,
        storeId: ctx.storeId,
        membershipId: ctx.membershipId,
        action: "TRENDYOL_CUSTOMER_QUESTION_ANSWER_FAILED",
        entityType: "trendyol_question",
        entityId: id,
        message: `Soru cevabı gönderilemedi (${id}): ${res.message.slice(0, 500)}`
      });
      return NextResponse.json(
        { success: false, error: res.message, requestId },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_CUSTOMER_QUESTION_ANSWER_SUBMITTED",
      entityType: "trendyol_question",
      entityId: id,
      message: `Müşteri sorusu cevabı iletildi (soru ${id}).`
    });

    return NextResponse.json({
      success: true,
      data: res.data,
      requestId
    });
  } catch (err) {
    const payload = logAndBuildApiError({
      err,
      fallbackMessage: "Cevap gönderilemedi.",
      requestId,
      context: {
        route: "/api/integrations/trendyol/customer-questions/[id]/answer",
        storeId: ctx.storeId,
        userId: ctx.userId
      }
    });
    return NextResponse.json({ ...payload, requestId }, { status: 500 });
  }
}
