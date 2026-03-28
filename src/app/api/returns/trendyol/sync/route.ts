import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  asRecord,
  fetchTrendyolReturnClaims,
  syncTrendyolClaimIssueReasonsToStore,
  upsertMarketplaceReturnClaimFromRaw
} from "@/lib/trendyolReturns";

const MS_DAY = 86_400_000;

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
    claimItemStatus?: string;
    startDate?: number;
    endDate?: number;
    orderNumber?: string;
  };

  const userId = ctx.userId;
  const storeId = ctx.storeId;
  const now = Date.now();
  const start = body.startDate ?? now - 30 * MS_DAY;
  const end = body.endDate ?? now;

  await createActivityLog({
    userId,
    storeId,
    membershipId: ctx.membershipId,
    action: "TRENDYOL_RETURN_SYNC_STARTED",
    entityType: "marketplace_return",
    message: "Trendyol iade senkronu başladı."
  });

  try {
    await syncTrendyolClaimIssueReasonsToStore(storeId);

    const pull = await fetchTrendyolReturnClaims({
      userId,
      storeId,
      claimItemStatus: body.claimItemStatus,
      startDate: start,
      endDate: end,
      orderNumber: body.orderNumber?.trim() || undefined
    });

    if (!pull.ok) {
      await createActivityLog({
        userId,
        storeId,
        membershipId: ctx.membershipId,
        action: "TRENDYOL_RETURN_SYNC_FAILED",
        entityType: "marketplace_return",
        message: pull.message
      });
      return NextResponse.json({ success: false, error: pull.message }, { status: 502 });
    }

    let n = 0;
    for (const item of pull.items) {
      const raw = asRecord(item);
      if (!raw) continue;
      const { id } = await upsertMarketplaceReturnClaimFromRaw({ storeId, raw });
      await prisma.marketplaceReturnClaimEvent.create({
        data: {
          storeId,
          claimRecordId: id,
          action: "RETURN_CLAIM_SYNCED",
          message: "İade kaydı senkronlandı.",
          rawData: { claimId: raw.claimId ?? raw.id } as object
        }
      });
      n += 1;
    }

    await createActivityLog({
      userId,
      storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_RETURN_SYNC_COMPLETED",
      entityType: "marketplace_return",
      message: `Trendyol iade senkronu tamamlandı (${n} kayıt).`
    });

    return NextResponse.json({ success: true, upserted: n });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Senkron hatası";
    await createActivityLog({
      userId,
      storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_RETURN_SYNC_FAILED",
      entityType: "marketplace_return",
      message: msg
    });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
