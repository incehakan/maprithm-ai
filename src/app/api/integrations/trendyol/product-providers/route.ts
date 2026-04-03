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

function extractNumericCargoIdDeep(v: unknown, depth = 0): number | null {
  if (depth > 8) return null;
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v) && v > 0 && v === Math.round(v)) {
    return Math.round(v);
  }
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    const n = parseInt(v.trim(), 10);
    return n > 0 ? n : null;
  }
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const k of ["cargoCompanyId", "cargoCompanyID", "id", "providerId"]) {
      const hit = extractNumericCargoIdDeep(o[k], depth + 1);
      if (hit != null) return hit;
    }
    for (const val of Object.values(o)) {
      const hit = extractNumericCargoIdDeep(val, depth + 1);
      if (hit != null) return hit;
    }
  }
  if (Array.isArray(v)) {
    for (const el of v) {
      const hit = extractNumericCargoIdDeep(el, depth + 1);
      if (hit != null) return hit;
    }
  }
  return null;
}

function optionsFromEnv(): ProviderOption[] {
  const raw = process.env.TRENDYOL_CARGO_COMPANY_IDS ?? "";
  if (!raw.trim()) return [];
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n));
  const uniq = Array.from(new Set(ids));
  return uniq.map((id) => ({
    id,
    label: `Sunucu varsayılanı (env) (${id})`
  }));
}

async function optionsFromCarrierReferenceTable(): Promise<ProviderOption[]> {
  const rows = await prisma.marketplaceCarrierReference.findMany({
    where: { platform: "trendyol", isActive: true },
    select: { providerName: true, rawData: true }
  });
  const out: ProviderOption[] = [];
  for (const r of rows) {
    const id = extractNumericCargoIdDeep(r.rawData);
    if (id == null) continue;
    const name = r.providerName?.trim() || `Kargo ${id}`;
    out.push({ id, label: `${name} (${id})` });
  }
  return Array.from(new Map(out.map((x) => [x.id, x])).values());
}

function mergeOptions(...lists: ProviderOption[][]): ProviderOption[] {
  const m = new Map<number, ProviderOption>();
  for (const list of lists) {
    for (const o of list) {
      if (!m.has(o.id)) m.set(o.id, o);
    }
  }
  return Array.from(m.values()).sort((a, b) => a.id - b.id);
}

function resolveSource(
  hasPrimary: boolean,
  hasOrderCargo: boolean,
  hasEnv: boolean,
  hasRef: boolean
): "product-providers" | "order-cargo" | "env" | "reference-db" | "merged" {
  const n =
    (hasPrimary ? 1 : 0) +
    (hasOrderCargo ? 1 : 0) +
    (hasEnv ? 1 : 0) +
    (hasRef ? 1 : 0);
  if (n > 1) return "merged";
  if (hasPrimary) return "product-providers";
  if (hasOrderCargo) return "order-cargo";
  if (hasEnv) return "env";
  if (hasRef) return "reference-db";
  return "merged";
}

/**
 * GET — ürün sağlayıcı listesi; 404/boşsa sipariş/kargo uçları, env ve referans tablo.
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

  const primaryData = primary.ok ? primary.data : null;
  const primaryOpts = primaryData != null ? normalizeProviderOptions(primaryData) : [];
  const carrierFb = await fetchTrendyolCarrierCompaniesForStore(
    ctx.userId,
    ctx.storeId,
    sellerId
  );
  const orderOpts =
    primaryOpts.length === 0 ? carriersToProviderOptions(carrierFb.items) : [];

  const envOpts = optionsFromEnv();
  const refOpts = await optionsFromCarrierReferenceTable();

  const hasPrimary = primaryOpts.length > 0;
  const hasOrder = orderOpts.length > 0;
  const hasEnv = envOpts.length > 0;
  const hasRef = refOpts.length > 0;

  const options = mergeOptions(primaryOpts, orderOpts, envOpts, refOpts);

  let data: unknown = null;
  if (hasPrimary && primary.ok) data = primary.data;
  else if (hasOrder) data = carrierFb.items;
  else if (hasEnv) data = { env: "TRENDYOL_CARGO_COMPANY_IDS" };
  else if (hasRef) data = { reference: "marketplaceCarrierReference" };

  const source = resolveSource(hasPrimary, hasOrder, hasEnv, hasRef);

  if (options.length === 0) {
    const primaryMsg = primary.ok
      ? "Ürün sağlayıcı yanıtı boş veya sayısal ID içermiyor."
      : primary.message || "Ürün sağlayıcı listesi alınamadı.";
    return NextResponse.json(
      {
        error: primaryMsg,
        primaryOk: primary.ok,
        primaryStatus: primary.status,
        carrierAttempts: carrierFb.attempts,
        hint:
          "Trendyol API sayısal cargoCompanyId döndürmediyse sunucu .env içine " +
          "TRENDYOL_CARGO_COMPANY_IDS=10,11 ekleyin (paneldeki geçerli ID'ler). " +
          "carrierAttempts ile hangi uçların hangi HTTP kodunu verdiğini görebilirsiniz."
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ data, options, source });
}
