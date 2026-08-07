import { NextRequest, NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getHbMerchantId } from "@/lib/hepsiburadaFetch";
import { fetchHbPackagesPage } from "@/lib/hepsiburadaOrderSync";

export async function GET(req: NextRequest) {
  try {
    let ctx;
    try {
      ctx = await requireActiveStore();
    } catch (e: any) {
      return NextResponse.json({ error: e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz." }, { status: 401 });
    }
    
    try {
      requirePermission(ctx, "marketplace.integrations.manage");
    } catch {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const merchantId = await getHbMerchantId(ctx.storeId).catch(() => null);
    if (!merchantId) {
      return NextResponse.json({ error: "Aktif Hepsiburada bağlantısı yok." }, { status: 400 });
    }

    const { packages, totalCount } = await fetchHbPackagesPage({
      storeId: ctx.storeId,
      merchantId,
      offset,
      limit,
      status,
    });

    return NextResponse.json({ success: true, data: { packages, totalCount } });
  } catch (error: any) {
    console.error("Hepsiburada orders get error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
