import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  fetchHbAskToSellerIssues,
  fetchHbAskToSellerIssuesCount,
} from "@/lib/hepsiburadaAskToSeller";

/**
 * GET /api/integrations/hepsiburada/ask-to-seller
 * Query: mode=count → count; aksi halde issues listesi.
 * SIT test sorusu: `createHbTestQuestion` (lib; POST /issues, SIT-only).
 */
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  if (url.searchParams.get("mode") === "count") {
    const result = await fetchHbAskToSellerIssuesCount({ storeId: ctx.storeId });
    if (!result.ok) {
      const authUnavailable = /401|403|Unauthorized|Forbidden|Yetkisiz/i.test(
        result.message
      );
      return NextResponse.json(
        { success: false, error: result.message, authUnavailable },
        { status: authUnavailable ? 401 : 502 }
      );
    }
    return NextResponse.json({ success: true, data: result.data });
  }

  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (k !== "mode") query[k] = v;
  });

  const result = await fetchHbAskToSellerIssues({
    storeId: ctx.storeId,
    query: Object.keys(query).length ? query : undefined,
  });
  if (!result.ok) {
    const authUnavailable = /401|403|Unauthorized|Forbidden|Yetkisiz/i.test(
      result.message
    );
    return NextResponse.json(
      { success: false, error: result.message, authUnavailable },
      { status: authUnavailable ? 401 : 502 }
    );
  }
  return NextResponse.json({ success: true, data: result.data });
}
