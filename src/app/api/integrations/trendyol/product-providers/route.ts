import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trendyolFetch } from "@/lib/trendyolFetch";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

type ProviderOption = { id: number; label: string };

function normalizeProviderOptions(payload: unknown): ProviderOption[] {
  const arr = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as any).data)
      ? (payload as any).data
      : [];
  const out: ProviderOption[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const idRaw = r.id ?? r.providerId ?? r.cargoCompanyId ?? r.code;
    const idNum = Number(idRaw);
    if (!Number.isFinite(idNum) || idNum <= 0) continue;
    const name =
      (typeof r.name === "string" && r.name.trim()) ||
      (typeof r.providerName === "string" && r.providerName.trim()) ||
      (typeof r.label === "string" && r.label.trim()) ||
      `Provider ${Math.round(idNum)}`;
    out.push({ id: Math.round(idNum), label: `${name} (${Math.round(idNum)})` });
  }
  return Array.from(new Map(out.map((x) => [x.id, x])).values());
}

/**
 * GET /integration/product/sellers/{sellerId}/providers
 */
export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
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
    return NextResponse.json({ error: "Satıcı ID tanımlı değil." }, { status: 400 });
  }

  const path = `/integration/product/sellers/${encodeURIComponent(sellerId)}/providers`;
  const result = await trendyolFetch<unknown>(ctx.userId, ctx.storeId, path);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message || "Sağlayıcı listesi alınamadı." },
      { status: result.status >= 400 ? result.status : 502 }
    );
  }

  return NextResponse.json({ data: result.data, options: normalizeProviderOptions(result.data) });
}
