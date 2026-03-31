import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { simulateTestLifecycle } from "@/lib/testLabOperations";

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
    nextStatus?: string;
  };

  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  const testSource = typeof body.testSource === "string" ? body.testSource : null;
  const nextStatus = typeof body.nextStatus === "string" ? body.nextStatus : null;

  if (!storeId || !testSource || !nextStatus) {
    return NextResponse.json(
      { success: false, error: "storeId, testSource ve nextStatus zorunlu." },
      { status: 400 }
    );
  }

  try {
    const res = await simulateTestLifecycle({
      userId: admin.userId,
      storeId,
      testSource,
      orderId: context.params.id,
      nextStatus
    });
    return NextResponse.json({ success: true, ...res });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lifecycle simülasyonu başarısız.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

