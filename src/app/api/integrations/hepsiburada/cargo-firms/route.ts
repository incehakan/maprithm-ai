import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { fetchHbCargoFirms } from "@/lib/hepsiburadaCargoProfiles";

/** GET /api/integrations/hepsiburada/cargo-firms */
export async function GET() {
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

  const result = await fetchHbCargoFirms({ storeId: ctx.storeId });
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.message }, { status: 502 });
  }
  return NextResponse.json({ success: true, data: result.data });
}
