import { prisma } from "@/lib/prisma";
import { trendyolFetch, type TrendyolFetchResult } from "@/lib/trendyolFetch";
import {
  fetchTrendyolCarrierCompaniesForStore,
  type NormalizedCarrierCompany
} from "@/lib/trendyolCarrier";
import {
  TRENDYOL_MP_CARGO_PRESETS,
  trendyolCargoPresetLabel
} from "@/lib/trendyolCargoPresets";

export type CargoSelectOption = { id: number; label: string };

function presetOptions(): CargoSelectOption[] {
  return TRENDYOL_MP_CARGO_PRESETS.map((p) => ({ id: p.id, label: p.label }));
}

function normalizeProviderOptions(payload: unknown): CargoSelectOption[] {
  const arr = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as any).data)
      ? (payload as any).data
      : [];
  const out: CargoSelectOption[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const idRaw = r.id ?? r.providerId ?? r.cargoCompanyId ?? r.code;
    const idNum = Number(idRaw);
    if (!Number.isFinite(idNum) || idNum <= 0) continue;
    const preset = trendyolCargoPresetLabel(Math.round(idNum));
    const name =
      preset ||
      (typeof r.name === "string" && r.name.trim()) ||
      (typeof r.providerName === "string" && r.providerName.trim()) ||
      (typeof r.label === "string" && r.label.trim()) ||
      `Kargo ${Math.round(idNum)}`;
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

function carriersToOptions(items: NormalizedCarrierCompany[]): CargoSelectOption[] {
  const out: CargoSelectOption[] = [];
  for (const it of items) {
    const id = numericIdFromCarrierRaw(it);
    if (id == null) continue;
    const preset = trendyolCargoPresetLabel(id);
    const label = preset ? `${preset} (${id})` : `${it.providerName} (${id})`;
    out.push({ id, label });
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

function optionsFromEnv(): CargoSelectOption[] {
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
    label: trendyolCargoPresetLabel(id) ?? `Sunucu (env) (${id})`
  }));
}

async function optionsFromCarrierReferenceTable(): Promise<CargoSelectOption[]> {
  const rows = await prisma.marketplaceCarrierReference.findMany({
    where: { platform: "trendyol", isActive: true },
    select: { providerName: true, rawData: true }
  });
  const out: CargoSelectOption[] = [];
  for (const r of rows) {
    const id = extractNumericCargoIdDeep(r.rawData);
    if (id == null) continue;
    const preset = trendyolCargoPresetLabel(id);
    const name = preset ?? r.providerName?.trim() ?? `Kargo ${id}`;
    out.push({ id, label: `${name} (${id})` });
  }
  return Array.from(new Map(out.map((x) => [x.id, x])).values());
}

export function mergeCargoSelectOptions(...lists: CargoSelectOption[][]): CargoSelectOption[] {
  const m = new Map<number, CargoSelectOption>();
  for (const list of lists) {
    for (const o of list) {
      if (!m.has(o.id)) m.set(o.id, o);
    }
  }
  return Array.from(m.values()).sort((a, b) => a.id - b.id);
}

function resolveSource(
  hasPrimary: boolean,
  hasOrder: boolean,
  hasEnv: boolean,
  hasRef: boolean
): string {
  const n =
    (hasPrimary ? 1 : 0) + (hasOrder ? 1 : 0) + (hasEnv ? 1 : 0) + (hasRef ? 1 : 0);
  if (n > 1) return "merged";
  if (hasPrimary) return "product-providers";
  if (hasOrder) return "order-cargo";
  if (hasEnv) return "env";
  if (hasRef) return "reference-db";
  return "presets";
}

/**
 * Trendyol kargo dropdown: önce MP hazır liste, sonra API/env/DB.
 */
export async function getTrendyolCargoSelectOptions(params: {
  userId: string;
  storeId: string;
}): Promise<{
  options: CargoSelectOption[];
  source: string;
  data: unknown;
  primary: TrendyolFetchResult<unknown>;
  carrierFb: Awaited<ReturnType<typeof fetchTrendyolCarrierCompaniesForStore>>;
}> {
  const presetOpts = presetOptions();

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: params.storeId, platform: "trendyol" } }
  });

  if (!conn?.isActive) {
    const envOpts = optionsFromEnv();
    const options = mergeCargoSelectOptions(presetOpts, envOpts);
    return {
      options,
      source: envOpts.length ? "presets+env" : "presets",
      data: { presets: true, connection: false },
      primary: { ok: false, status: 0, message: "Bağlantı yok" },
      carrierFb: {
        ok: true as const,
        items: [],
        source: "empty" as const,
        message: "—",
        attempts: []
      }
    };
  }

  const sellerId = String(conn.sellerId).trim();
  if (!sellerId) {
    const options = mergeCargoSelectOptions(presetOpts, optionsFromEnv());
    return {
      options,
      source: "presets",
      data: { presets: true },
      primary: { ok: false, status: 400, message: "Seller ID yok" },
      carrierFb: {
        ok: true as const,
        items: [],
        source: "empty" as const,
        message: "—",
        attempts: []
      }
    };
  }

  const productPath = `/integration/product/sellers/${encodeURIComponent(sellerId)}/providers`;
  const primary = await trendyolFetch<unknown>(params.userId, params.storeId, productPath);

  const primaryData = primary.ok ? primary.data : null;
  const primaryOpts = primaryData != null ? normalizeProviderOptions(primaryData) : [];
  const carrierFb = await fetchTrendyolCarrierCompaniesForStore(
    params.userId,
    params.storeId,
    sellerId
  );
  const orderOpts =
    primaryOpts.length === 0 ? carriersToOptions(carrierFb.items) : [];

  const envOpts = optionsFromEnv();
  const refOpts = await optionsFromCarrierReferenceTable();

  const hasPrimary = primaryOpts.length > 0;
  const hasOrder = orderOpts.length > 0;
  const hasEnv = envOpts.length > 0;
  const hasRef = refOpts.length > 0;

  const options = mergeCargoSelectOptions(
    presetOpts,
    primaryOpts,
    orderOpts,
    envOpts,
    refOpts
  );

  let data: unknown = null;
  if (hasPrimary && primary.ok) data = primary.data;
  else if (hasOrder) data = carrierFb.items;
  else if (hasEnv) data = { env: "TRENDYOL_CARGO_COMPANY_IDS" };
  else if (hasRef) data = { reference: "marketplaceCarrierReference" };
  else data = { presets: "TRENDYOL_MP_CARGO_PRESETS" };

  const source = resolveSource(hasPrimary, hasOrder, hasEnv, hasRef);

  return {
    options,
    source: presetOpts.length && source === "merged" ? "presets+" + source : source,
    data,
    primary,
    carrierFb
  };
}

/** Mağazada kullanılmış ek ID’leri isimlendirip listeye ekler. */
export function mergeExtraCargoIds(
  base: CargoSelectOption[],
  extraIds: number[]
): CargoSelectOption[] {
  const extra: CargoSelectOption[] = [];
  const have = new Set(base.map((o) => o.id));
  for (const id of extraIds) {
    if (!Number.isFinite(id) || id <= 0 || have.has(id)) continue;
    have.add(id);
    extra.push({
      id,
      label: trendyolCargoPresetLabel(id) ?? `Kayıtlı kargo (${id})`
    });
  }
  return mergeCargoSelectOptions(base, extra);
}
