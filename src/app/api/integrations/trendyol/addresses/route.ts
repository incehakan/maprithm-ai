import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trendyolFetch } from "@/lib/trendyolFetch";
import { normalizeTrendyolAddressesResponse } from "@/lib/trendyolAddresses";
import { requireActiveStore } from "@/lib/requireActiveStore";

/**
 * GET /api/integrations/trendyol/addresses
 * Trendyol: önce /integration/product/sellers/{sellerId}/addresses, 404 ise legacy path
 */
export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } }
  });

  if (!conn?.isActive) {
    return NextResponse.json(
      { error: "Aktif Trendyol bağlantısı yok." },
      { status: 400 }
    );
  }

  const sellerId = String(conn.sellerId).trim();
  if (!sellerId) {
    return NextResponse.json(
      { error: "Satıcı ID (Seller ID) tanımlı değil." },
      { status: 400 }
    );
  }

  const primaryPath = `/integration/product/sellers/${encodeURIComponent(
    sellerId
  )}/addresses`;
  const fallbackPath = `/integration/sellers/${encodeURIComponent(sellerId)}/addresses`;

  let result = await trendyolFetch<unknown>(ctx.userId, ctx.storeId, primaryPath);
  if (!result.ok && result.status === 404) {
    result = await trendyolFetch<unknown>(ctx.userId, ctx.storeId, fallbackPath);
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message || "Trendyol adres listesi alınamadı." },
      { status: result.status >= 400 ? result.status : 502 }
    );
  }

  const normalized = normalizeTrendyolAddressesResponse(result.data);

  const emptyHint =
    normalized.addresses.length === 0
      ? "Trendyol bu satıcı için adres listesi döndürmedi. Satıcı panelinde sevkiyat ve iade adreslerinizin tanımlı olduğundan emin olun. Satıcı başvuru süreci tamamlanmamışsa bu servis boş dönebilir (Trendyol dokümantasyonu)."
      : null;

  return NextResponse.json({
    sellerId,
    ...normalized,
    emptyHint,
    raw: result.data
  });
}
