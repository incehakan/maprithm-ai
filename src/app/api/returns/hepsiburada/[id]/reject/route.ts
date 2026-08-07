import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  rejectHbReturnClaim,
  refreshHbReturnClaimInDb
} from "@/lib/hepsiburadaReturns";
import { logger } from "@/lib/logger";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
  const body = (await request.json().catch(() => ({}))) as {
    reasonCode?: string;
    message?: string;
  };

  const reasonCode = body.reasonCode?.trim();
  if (!reasonCode) {
    return NextResponse.json(
      { success: false, error: "reasonCode gerekli." },
      { status: 400 }
    );
  }

  const storeId = ctx.storeId;
  const claim = await prisma.marketplaceReturnClaim.findFirst({
    where: { id, storeId, platform: "hepsiburada", isTestRecord: false }
  });
  if (!claim) {
    return NextResponse.json({ success: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }

  const prev = claim.claimStatus;
  const res = await rejectHbReturnClaim({
    storeId,
    claimId: claim.claimId,
    reasonCode,
    description: body.message
  });

  if (!res.ok) {
    logger.error("hb_return_operation_failed", {
      route: "/api/returns/hepsiburada/[id]/reject",
      storeId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
      claimId: claim.claimId,
      operation: "reject",
      error: res.message
    });
    await prisma.marketplaceReturnClaimEvent.create({
      data: {
        storeId,
        claimRecordId: claim.id,
        action: "RETURN_CLAIM_OPERATION_FAILED",
        message: res.message,
        previousStatus: prev,
        rawData: { operation: "reject", reasonCode }
      }
    });
    await createActivityLog({
      userId: ctx.userId,
      storeId,
      membershipId: ctx.membershipId,
      action: "HB_RETURN_OPERATION_FAILED",
      entityType: "marketplace_return",
      entityId: claim.id,
      message: `Hepsiburada iade reddi başarısız: ${claim.claimId} — ${res.message}`
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
      action: "RETURN_CLAIM_REJECTED",
      message: (body.message ?? "").trim() || "Hepsiburada iadesi reddedildi.",
      previousStatus: prev,
      nextStatus: nextSt,
      rawData: {
        reasonCode,
        refreshOk: ref.ok,
        refreshMessage: ref.ok ? undefined : ref.message
      }
    }
  });

  await createActivityLog({
    userId: ctx.userId,
    storeId,
    membershipId: ctx.membershipId,
    action: "HB_RETURN_REJECTED",
    entityType: "marketplace_return",
    entityId: claim.id,
    message: `Hepsiburada iade reddi: claim ${claim.claimId}`
  });

  return NextResponse.json({ success: true, claimStatus: nextSt });
}
