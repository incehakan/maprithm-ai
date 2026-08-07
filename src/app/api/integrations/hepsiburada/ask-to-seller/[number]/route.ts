import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { fetchHbAskToSellerIssueByNumber } from "@/lib/hepsiburadaAskToSeller";

/** GET /api/integrations/hepsiburada/ask-to-seller/[number] */
export async function GET(
  _request: Request,
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

  const result = await fetchHbAskToSellerIssueByNumber({
    storeId: ctx.storeId,
    number: params.number,
  });
  if (!result.ok) {
    const authFail = /401|403|Yetkisiz|Unauthorized|Forbidden/i.test(result.message);
    return NextResponse.json(
      { success: false, error: result.message, authUnavailable: authFail },
      { status: authFail ? 401 : 502 }
    );
  }
  return NextResponse.json({ success: true, data: result.data });
}
