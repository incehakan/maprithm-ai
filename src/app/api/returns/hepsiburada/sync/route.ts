import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { syncHbReturnClaimsToStore } from "@/lib/hepsiburadaReturns";

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 401 });
  }
  try {
    requirePermission(ctx, "returns.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
  };

  const userId = ctx.userId;
  const storeId = ctx.storeId;

  await createActivityLog({
    userId,
    storeId,
    membershipId: ctx.membershipId,
    action: "HB_RETURN_SYNC_STARTED",
    entityType: "marketplace_return",
    message: "Hepsiburada iade senkronu başladı."
  });

  try {
    const result = await syncHbReturnClaimsToStore({ storeId, status: body.status });

    await createActivityLog({
      userId,
      storeId,
      membershipId: ctx.membershipId,
      action: "HB_RETURN_SYNC_COMPLETED",
      entityType: "marketplace_return",
      message: `Hepsiburada iade senkronu tamamlandı (${result.synced} kayıt, ${result.errors} hata).`
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Senkron hatası";
    await createActivityLog({
      userId,
      storeId,
      membershipId: ctx.membershipId,
      action: "HB_RETURN_SYNC_FAILED",
      entityType: "marketplace_return",
      message: msg
    });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
