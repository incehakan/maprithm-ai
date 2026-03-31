import { NextResponse } from "next/server";
import { createActivityLog } from "@/lib/activityLog";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { extractRejectedPackageIdForTracking, updateRejectedPackageTracking } from "@/lib/trendyolReturns";
import { logger } from "@/lib/logger";

type Ctx = Awaited<ReturnType<typeof requireActiveStore>>;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let ctx: Ctx;
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
    trackingNumber?: string;
    cargoProviderCode?: string;
    cargoProviderName?: string;
    packageId?: string;
  };

  const tn = body.trackingNumber?.trim();
  const code = body.cargoProviderCode?.trim();
  if (!tn || !code) {
    return NextResponse.json(
      { success: false, error: "trackingNumber ve cargoProviderCode gerekli." },
      { status: 400 }
    );
  }

  const storeId = ctx.storeId;
  const claim = await prisma.marketplaceReturnClaim.findFirst({
    where: { id, storeId, isTestRecord: false }
  });
  if (!claim) {
    return NextResponse.json({ success: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }

  const pkgId =
    body.packageId?.trim() ||
    extractRejectedPackageIdForTracking(claim.rejectedPackageInfo, claim.shipmentPackageId);
  if (!pkgId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Paket kimliği çıkarılamadı. Body’de packageId verin veya rejectedPackageInfo güncel olsun."
      },
      { status: 400 }
    );
  }

  const prev = claim.claimStatus;
  const res = await updateRejectedPackageTracking({
    userId: ctx.userId,
    storeId,
    packageId: pkgId,
    cargoSenderNumber: tn,
    providerCode: code
  });

  if (!res.ok) {
    logger.error("return_operation_failed", {
      route: "/api/returns/[id]/update-rejected-tracking",
      storeId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
      claimId: claim.claimId,
      operation: "update_rejected_tracking",
      error: res.message
    });
    await prisma.marketplaceReturnClaimEvent.create({
      data: {
        storeId,
        claimRecordId: claim.id,
        action: "RETURN_CLAIM_OPERATION_FAILED",
        message: res.message,
        previousStatus: prev,
        rawData: { operation: "update_rejected_tracking", packageId: pkgId }
      }
    });
    await createActivityLog({
      userId: ctx.userId,
      storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_RETURN_OPERATION_FAILED",
      entityType: "marketplace_return",
      entityId: claim.id,
      message: `Red paketi takip güncelleme başarısız: ${claim.claimId} — ${res.message}`
    });
    return NextResponse.json({ success: false, error: res.message }, { status: 502 });
  }

  await prisma.marketplaceReturnClaimEvent.create({
    data: {
      storeId,
      claimRecordId: claim.id,
      action: "RETURN_CLAIM_REJECT_TRACKING_UPDATED",
      message: "Red paketi kargo takibi güncellendi.",
      previousStatus: prev,
      rawData: {
        packageId: pkgId,
        trackingNumber: tn,
        cargoProviderCode: code,
        cargoProviderName: body.cargoProviderName?.trim() ?? null
      }
    }
  });

  await createActivityLog({
    userId: ctx.userId,
    storeId,
    membershipId: ctx.membershipId,
    action: "TRENDYOL_RETURN_REJECT_TRACKING_UPDATED",
    entityType: "marketplace_return",
    entityId: claim.id,
    message: `Trendyol red paketi takip: ${tn}`
  });

  return NextResponse.json({ success: true });
}
