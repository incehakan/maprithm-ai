import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { answerHbAskToSellerIssue } from "@/lib/hepsiburadaAskToSeller";

/** POST /api/integrations/hepsiburada/ask-to-seller/[number]/answer */
export async function POST(
  request: Request,
  { params }: { params: { number: string } }
) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }
  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    answerText?: string;
    answer?: string;
  } | null;
  const answerText = (body?.answerText ?? body?.answer ?? "").trim();
  if (!answerText) {
    return NextResponse.json(
      { success: false, error: "answerText zorunludur." },
      { status: 400 }
    );
  }

  const result = await answerHbAskToSellerIssue({
    storeId: ctx.storeId,
    number: params.number,
    answerText,
  });
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.message }, { status: 502 });
  }
  return NextResponse.json({ success: true, data: result.data });
}
