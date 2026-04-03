import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trendyolFetch } from "@/lib/trendyolFetch";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  fetchTrendyolCarrierCompaniesForStore,
  type NormalizedCarrierCompany
} from "@/lib/trendyolCarrier";

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

function numericIdFromCarrierRaw(c: NormalizedCarrierCompany): number | null {
  const raw = c.rawData;
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    for (const k of ["cargoCompanyId", "id", "providerId", "companyId"]) {
      const v = r[k];
      if (v != null && Number.isFinite(Number(v))) {
        const n = Math.round(Number(v));
        if (n > 0) return n;
      }
    }
  }
  if (/^\d+$/.test(c.providerCode)) {
    return parseInt(c.providerCode, 10);
  }
  return null;
}

function carriersToProviderOptions(items: NormalizedCarrierCompany[]): ProviderOption[] {
  const out: ProviderOption[] = [];
  for (const it of items) {
    const id = numericIdFromCarrierRaw(it);
    if (id == null) continue;
    out.push({
      id,
      label: `${it.providerName} (${id})`
    });
  }
  return Array.from(new Map(out.map((x) => [x.id, x])).values());
}

/**
 * GET — önce ürün sağlayıcı listesi; 404/boşsa sipariş/kargo uçları (mağaza kimliğiyle).
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

  const productPath = `/integration/product/sellers/${encodeURIComponent(sellerId)}/providers`;
  const primary = await trendyolFetch<unknown>(ctx.userId, ctx.storeId, productPath);

  let data: unknown = primary.ok ? primary.data : null;
  let options = primary.ok ? normalizeProviderOptions(primary.data) : [];
  let source: "product-providers" | "order-cargo" = "product-providers";

  if (options.length === 0) {
    const fb = await fetchTrendyolCarrierCompaniesForStore(ctx.userId, ctx.storeId);
    const fromOrder = carriersToProviderOptions(fb.items);
    if (fromOrder.length > 0) {
      data = fb.items;
      options = fromOrder;
      source = "order-cargo";
    }
  }

  if (options.length === 0) {
    const primaryMsg = primary.ok
      ? "Ürün sağlayıcı yanıtı boş veya sayısal ID içermiyor."
      : primary.message || "Ürün sağlayıcı listesi alınamadı.";
    return NextResponse.json(
      {
        error: primaryMsg,
        primaryOk: primary.ok,
        primaryStatus: primary.status,
        hint:
          "Bazı hesaplarda /integration/product/sellers/{id}/providers 404 döner; " +
          "kargo listesi /integration/order/* uçlarından denendi. Hâlâ boşsa Seller ID ve " +
          "Trendyol panelinde anlaşmalı kargo tanımını kontrol edin. Geçici çözüm: .env içinde TRENDYOL_CARGO_COMPANY_IDS."
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ data, options, source });
}
