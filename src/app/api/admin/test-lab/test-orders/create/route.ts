import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { createTestOrder, type TestLabCreateOrderInput } from "@/lib/testLabOperations";

export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireSystemAdmin>>;
  try {
    admin = await requireSystemAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<
    TestLabCreateOrderInput & { testSource?: string }
  >;

  const testSource =
    typeof body.testSource === "string" && body.testSource.trim()
      ? body.testSource.trim()
      : null;

  if (!testSource) {
    return NextResponse.json(
      { success: false, error: "testSource gerekli." },
      { status: 400 }
    );
  }

  if (!body.storeId) {
    return NextResponse.json(
      { success: false, error: "storeId gerekli." },
      { status: 400 }
    );
  }

  const storeExists = await prisma.store.findFirst({
    where: { id: body.storeId }
  });
  if (!storeExists) {
    return NextResponse.json(
      { success: false, error: "Store bulunamadı." },
      { status: 404 }
    );
  }

  try {
    const input: TestLabCreateOrderInput = {
      storeId: body.storeId,
      testSource,
      orderNumber: (body.orderNumber as string) ?? "",
      shipmentPackageId: (body.shipmentPackageId as string) ?? "",
      customerFirstName: (body.customerFirstName as string | null | undefined) ?? null,
      customerLastName: (body.customerLastName as string | null | undefined) ?? null,
      packageStatus: (body.packageStatus as string | null | undefined) ?? null,
      totalPrice:
        typeof body.totalPrice === "number" ? body.totalPrice : body.totalPrice ? Number(body.totalPrice) : null,
      currency: (body.currency as string | undefined) ?? "TRY",
      cargoProviderName: (body.cargoProviderName as string | null | undefined) ?? null,
      cargoProviderCode: (body.cargoProviderCode as string | null | undefined) ?? null,
      cargoTrackingNumber: (body.cargoTrackingNumber as string | null | undefined) ?? null,
      cargoSenderNumber: (body.cargoSenderNumber as string | null | undefined) ?? null,
      lines: Array.isArray(body.lines) ? (body.lines as any) : []
    };

    if (input.lines.length === 0) {
      return NextResponse.json(
        { success: false, error: "En az 1 ürün satırı gerekli." },
        { status: 400 }
      );
    }

    const created = await createTestOrder({
      userId: admin.userId,
      storeId: input.storeId,
      testSource,
      input
    });

    return NextResponse.json({ success: true, ...created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Test order oluşturulamadı.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

