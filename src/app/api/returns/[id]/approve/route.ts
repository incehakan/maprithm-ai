import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  approveReturnClaim,
  asRecord,
  extractClaimLineItemIdsForApprove,
  refreshTrendyolReturnClaimInDb
} from "@/lib/trendyolReturns";
import { logger } from "@/lib/logger";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
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

  const { id } = await context.params;
  const storeId = ctx.storeId;
  const claim = await prisma.marketplaceReturnClaim.findFirst({
    where: { id, storeId, isTestRecord: false }
  });
  if (!claim) {
    return NextResponse.json({ success: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }

  const raw = asRecord(claim.rawData);
  if (!raw) {
    return NextResponse.json(
      { success: false, error: "rawData yok; önce senkron yapın." },
      { status: 400 }
    );
  }

  const lineIds = extractClaimLineItemIdsForApprove(raw);
  if (lineIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "Onaylanacak kalem kimliği bulunamadı; senkronu tekrarlayın." },
      { status: 400 }
    );
  }

  const prev = claim.claimStatus;
  const res = await approveReturnClaim({
    userId: ctx.userId,
    storeId,
    claimId: claim.claimId,
    claimLineItemIds: lineIds
  });

  if (!res.ok) {
    logger.error("return_operation_failed", {
      route: "/api/returns/[id]/approve",
      storeId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
      claimId: claim.claimId,
      operation: "approve",
      error: res.message
    });
    await prisma.marketplaceReturnClaimEvent.create({
      data: {
        storeId,
        claimRecordId: claim.id,
        action: "RETURN_CLAIM_OPERATION_FAILED",
        message: res.message,
        previousStatus: prev,
        rawData: { operation: "approve" }
      }
    });
    await createActivityLog({
      userId: ctx.userId,
      storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_RETURN_OPERATION_FAILED",
      entityType: "marketplace_return",
      entityId: claim.id,
      message: `İade onayı başarısız: ${claim.claimId} — ${res.message}`
    });
    return NextResponse.json({ success: false, error: res.message }, { status: 502 });
  }

  const ref = await refreshTrendyolReturnClaimInDb({
    userId: ctx.userId,
    storeId,
    trendyolClaimId: claim.claimId
  });
  const updated = await prisma.marketplaceReturnClaim.findFirst({
    where: { id: claim.id, storeId },
    select: { claimStatus: true }
  });
  const nextSt = updated?.claimStatus ?? prev;

  await prisma.marketplaceReturnClaimEvent.create({
    data: {
      storeId,
      claimRecordId: claim.id,
      action: "RETURN_CLAIM_APPROVED",
      message: "İade onaylandı.",
      previousStatus: prev,
      nextStatus: nextSt,
      rawData: { trendyolOk: true, refreshOk: ref.ok, refreshMessage: ref.ok ? undefined : ref.message }
    }
  });

  await createActivityLog({
    userId: ctx.userId,
    storeId,
    membershipId: ctx.membershipId,
    action: "TRENDYOL_RETURN_APPROVED",
    entityType: "marketplace_return",
    entityId: claim.id,
    message: `Trendyol iade onayı: claim ${claim.claimId}`
  });

  return NextResponse.json({ success: true, claimStatus: nextSt });
}
