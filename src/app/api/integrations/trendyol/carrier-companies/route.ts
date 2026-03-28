import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { STATIC_TRENDYOL_TR_CARRIERS } from "@/lib/trendyolCarrier";

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  try {
    requirePermission(ctx, "orders.view");
  } catch {
    return NextResponse.json({ error: "Erişim yok." }, { status: 403 });
  }

  const rows = await prisma.marketplaceCarrierReference.findMany({
    where: { platform: "trendyol", isActive: true },
    orderBy: { providerName: "asc" },
    select: {
      providerCode: true,
      providerName: true,
      region: true
    }
  });

  const carriers =
    rows.length > 0
      ? rows
      : STATIC_TRENDYOL_TR_CARRIERS.map((c) => ({
          providerCode: c.providerCode,
          providerName: c.providerName,
          region: c.region
        }));

  return NextResponse.json({ success: true, carriers });
}
