import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  approveHbReturnClaim,
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
  const storeId = ctx.storeId;

  const body = (await request.json().catch(() => ({}))) as {
    finalizedWith?: "Refund" | "Change";
    invoiceLink?: string;
    acceptionReason?: string;
  };
  const finalizedWith: "Refund" | "Change" =
    body.finalizedWith === "Change" ? "Change" : "Refund";

  const claim = await prisma.marketplaceReturnClaim.findFirst({
    where: { id, storeId, platform: "hepsiburada", isTestRecord: false }
  });
  if (!claim) {
    return NextResponse.json({ success: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }

  const prev = claim.claimStatus;
  const res = await approveHbReturnClaim({
    storeId,
    claimId: claim.claimId,
    finalizedWith,
    invoiceLink: body.invoiceLink,
    acceptionReason: body.acceptionReason
  });

  if (!res.ok) {
    logger.error("hb_return_operation_failed", {
      route: "/api/returns/hepsiburada/[id]/approve",
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
      action: "HB_RETURN_OPERATION_FAILED",
      entityType: "marketplace_return",
      entityId: claim.id,
      message: `Hepsiburada iade onayı başarısız: ${claim.claimId} — ${res.message}`
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
      action: "RETURN_CLAIM_APPROVED",
      message: `Hepsiburada iade onaylandı (${finalizedWith}).`,
      previousStatus: prev,
      nextStatus: nextSt,
      rawData: { hbOk: true, finalizedWith, refreshOk: ref.ok, refreshMessage: ref.ok ? undefined : ref.message }
    }
  });

  await createActivityLog({
    userId: ctx.userId,
    storeId,
    membershipId: ctx.membershipId,
    action: "HB_RETURN_APPROVED",
    entityType: "marketplace_return",
    entityId: claim.id,
    message: `Hepsiburada iade onayı: claim ${claim.claimId}`
  });

  return NextResponse.json({ success: true, claimStatus: nextSt });
}
