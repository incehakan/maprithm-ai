import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { updateTestTrackingAndLabel } from "@/lib/testLabOperations";

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
    trackingNumber?: string;
    providerCode?: string;
    providerName?: string;
    cargoSenderNumber?: string | null;
    labelUrl?: string | null;
    labelFormat?: string | null;
  };

  if (
    !body.storeId ||
    !body.testSource ||
    !body.trackingNumber ||
    !body.providerCode ||
    !body.providerName
  ) {
    return NextResponse.json(
      { success: false, error: "storeId, testSource, trackingNumber, providerCode, providerName gerekli." },
      { status: 400 }
    );
  }

  try {
    const res = await updateTestTrackingAndLabel({
      userId: admin.userId,
      storeId: body.storeId,
      testSource: body.testSource,
      orderId: context.params.id,
      trackingNumber: body.trackingNumber,
      providerCode: body.providerCode,
      providerName: body.providerName,
      cargoSenderNumber: body.cargoSenderNumber,
      labelUrl: body.labelUrl,
      labelFormat: body.labelFormat
    });

    return NextResponse.json({ success: true, ...res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Tracking simülasyonu başarısız.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

