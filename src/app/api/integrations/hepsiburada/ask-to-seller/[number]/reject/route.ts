import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { rejectHbAskToSellerIssue } from "@/lib/hepsiburadaAskToSeller";

/** POST /api/integrations/hepsiburada/ask-to-seller/[number]/reject */
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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const result = await rejectHbAskToSellerIssue({
    storeId: ctx.storeId,
    number: params.number,
    reasonCode:
      typeof body.reasonCode === "string" ? body.reasonCode : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
    body,
  });
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.message }, { status: 502 });
  }
  return NextResponse.json({ success: true, data: result.data });
}
