import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { simulateTestInvoice } from "@/lib/testLabOperations";

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
    invoiceNumber?: string;
    invoiceDateTime?: string;
    invoiceLink?: string;
    invoiceStatus?: "sent" | "failed";
  };

  if (
    !body.storeId ||
    !body.testSource ||
    !body.invoiceNumber ||
    !body.invoiceDateTime ||
    !body.invoiceLink ||
    !body.invoiceStatus
  ) {
    return NextResponse.json(
      { success: false, error: "storeId, testSource, invoice bilgileri gerekli." },
      { status: 400 }
    );
  }

  try {
    const res = await simulateTestInvoice({
      userId: admin.userId,
      storeId: body.storeId,
      testSource: body.testSource,
      orderId: context.params.id,
      invoiceNumber: body.invoiceNumber,
      invoiceDateTime: body.invoiceDateTime,
      invoiceLink: body.invoiceLink,
      invoiceStatus: body.invoiceStatus
    });
    return NextResponse.json({ success: true, ...res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invoice simülasyonu başarısız.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

