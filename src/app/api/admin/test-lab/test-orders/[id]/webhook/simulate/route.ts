import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { simulateTestWebhook } from "@/lib/testLabOperations";

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
    nextPackageStatus?: string;
    trackingNumber?: string | null;
    providerCode?: string | null;
    providerName?: string | null;
  };

  if (
    !body.storeId ||
    !body.testSource ||
    !body.nextPackageStatus
  ) {
    return NextResponse.json(
      { success: false, error: "storeId, testSource ve nextPackageStatus gerekli." },
      { status: 400 }
    );
  }

  try {
    const res = await simulateTestWebhook({
      userId: admin.userId,
      storeId: body.storeId,
      testSource: body.testSource,
      orderId: context.params.id,
      nextPackageStatus: body.nextPackageStatus,
      trackingNumber: body.trackingNumber,
      providerCode: body.providerCode,
      providerName: body.providerName
    });
    return NextResponse.json({ success: true, ...res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook simülasyonu başarısız.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

