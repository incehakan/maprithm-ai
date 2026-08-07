import { NextResponse } from "next/server";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { fetchTrendyolBuyboxInfo } from "@/lib/trendyolBuybox";

// Geçici debug ucu — buybox sonucu boş gelme sebebini teşhis etmek için.
export async function GET(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get("barcode") ?? "";
  const res = await fetchTrendyolBuyboxInfo({
    userId: ctx.userId,
    storeId: ctx.storeId,
    barcodes: [barcode]
  });
  return NextResponse.json(res);
}
