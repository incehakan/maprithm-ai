import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { createTestSplitPackage } from "@/lib/testLabOperations";

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
    childShipmentPackageId?: string;
    moveLineCount?: number;
  };

  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  const testSource = typeof body.testSource === "string" ? body.testSource : null;
  const childShipmentPackageId =
    typeof body.childShipmentPackageId === "string" ? body.childShipmentPackageId : null;
  const moveLineCount =
    typeof body.moveLineCount === "number" ? body.moveLineCount : 1;

  if (!storeId || !testSource || !childShipmentPackageId) {
    return NextResponse.json(
      { success: false, error: "storeId, testSource ve childShipmentPackageId gerekli." },
      { status: 400 }
    );
  }

  try {
    const created = await createTestSplitPackage({
      userId: admin.userId,
      storeId,
      testSource,
      parentOrderId: context.params.id,
      childShipmentPackageId,
      moveLineCount
    });
    return NextResponse.json({ success: true, ...created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Split simülasyonu başarısız.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

