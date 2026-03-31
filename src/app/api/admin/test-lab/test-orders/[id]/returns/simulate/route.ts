import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { createTestReturnClaim } from "@/lib/testLabOperations";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  let admin: Awaited<ReturnType<typeof requireSystemAdmin>>;
  try {
    admin = await requireSystemAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    storeId?: string;
    testSource?: string;
    claimId?: string;
    claimStatus?: string;
    returnReasonId?: string | number | null;
    returnReasonText?: string | null;
    approveOrReject?: "approve" | "reject" | null;
    rejectTrackingNumber?: string | null;
    rejectProviderName?: string | null;
    rejectPackageId?: string | null;
  };

  if (
    !body.storeId ||
    !body.testSource ||
    !body.claimId ||
    !body.claimStatus ||
    !body.approveOrReject
  ) {
    // approveOrReject null is allowed, so only validate required fields.
    if (!body.storeId || !body.testSource || !body.claimId || !body.claimStatus) {
      return NextResponse.json(
        { success: false, error: "storeId, testSource, claimId ve claimStatus gerekli." },
        { status: 400 }
      );
    }
  }

  try {
    const res = await createTestReturnClaim({
      userId: admin.userId,
      storeId: body.storeId,
      testSource: body.testSource,
      orderId: context.params.id,
      claimId: body.claimId,
      claimStatus: body.claimStatus,
      returnReasonId:
        body.returnReasonId == null ? null : String(body.returnReasonId),
      returnReasonText: body.returnReasonText,
      rejectTrackingNumber: body.rejectTrackingNumber,
      rejectProviderName: body.rejectProviderName,
      rejectPackageId: body.rejectPackageId,
      approveOrReject: body.approveOrReject ?? null
    });
    return NextResponse.json({ success: true, ...res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Return simülasyonu başarısız.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

