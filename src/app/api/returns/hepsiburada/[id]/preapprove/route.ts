import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  preApproveHbReturnClaim,
  refreshHbReturnClaimInDb
} from "@/lib/hepsiburadaReturns";
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
    where: { id, storeId, platform: "hepsiburada", isTestRecord: false }
  });
  if (!claim) {
    return NextResponse.json({ success: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }

  const prev = claim.claimStatus;
  const res = await preApproveHbReturnClaim({ storeId, claimId: claim.claimId });

  if (!res.ok) {
    logger.error("hb_return_operation_failed", {
      route: "/api/returns/hepsiburada/[id]/preapprove",
      storeId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
      claimId: claim.claimId,
      operation: "preapprove",
      error: res.message
    });
    await prisma.marketplaceReturnClaimEvent.create({
      data: {
        storeId,
        claimRecordId: claim.id,
        action: "RETURN_CLAIM_OPERATION_FAILED",
        message: res.message,
        previousStatus: prev,
        rawData: { operation: "preapprove" }
      }
    });
    await createActivityLog({
      userId: ctx.userId,
      storeId,
      membershipId: ctx.membershipId,
      action: "HB_RETURN_OPERATION_FAILED",
      entityType: "marketplace_return",
      entityId: claim.id,
      message: `Hepsiburada iade ön onayı başarısız: ${claim.claimId} — ${res.message}`
    });
    return NextResponse.json({ success: false, error: res.message }, { status: 502 });
  }

  const ref = await refreshHbReturnClaimInDb({ storeId, claimId: claim.claimId, knownStatus: prev });
  const updated = await prisma.marketplaceReturnClaim.findFirst({
    where: { id: claim.id, storeId },
    select: { claimStatus: true }
  });
  const nextSt = updated?.claimStatus ?? prev;

  await prisma.marketplaceReturnClaimEvent.create({
    data: {
      storeId,
      claimRecordId: claim.id,
      action: "RETURN_CLAIM_PREAPPROVED",
      message: "Hepsiburada iade talebi ön onaylandı.",
      previousStatus: prev,
      nextStatus: nextSt,
      rawData: { hbOk: true, refreshOk: ref.ok, refreshMessage: ref.ok ? undefined : ref.message }
    }
  });

  await createActivityLog({
    userId: ctx.userId,
    storeId,
    membershipId: ctx.membershipId,
    action: "HB_RETURN_PREAPPROVED",
    entityType: "marketplace_return",
    entityId: claim.id,
    message: `Hepsiburada iade ön onayı: claim ${claim.claimId}`
  });

  return NextResponse.json({ success: true, claimStatus: nextSt });
}
