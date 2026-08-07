import { prisma } from "@/lib/prisma";
import { TRENDYOL_MP_CARGO_PRESETS, trendyolCargoPresetLabel } from "@/lib/trendyolCargoPresets";
import { syncTrendyolCargoCompanies } from "@/lib/trendyol/syncTrendyolCargoCompanies";
import type { TrendyolCarrierFetchAttempt } from "@/lib/trendyolCarrier";

export type CargoSelectOption = { id: number; label: string };

export type CargoCompanySource =
  | "db"
  | "fallback-env"
  | "fallback-preset"
  | "fallback-mapping";

function formatOptionLabel(name: string, id: number): string {
  const n = name.trim();
  if (!n) return `Kargo (${id})`;
  return `${n} (${id})`;
}

function dbRowsToOptions(
  rows: Array<{ cargoCompanyId: number; name: string }>
): CargoSelectOption[] {
  return rows.map((r) => ({
    id: r.cargoCompanyId,
    label: formatOptionLabel(r.name, r.cargoCompanyId)
  }));
}

function presetOptions(): CargoSelectOption[] {
  return TRENDYOL_MP_CARGO_PRESETS.map((p) => ({
    id: p.id,
    label: formatOptionLabel(p.label, p.id)
  }));
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
    label: formatOptionLabel(
      trendyolCargoPresetLabel(id) ?? `Sunucu env`,
      id
    )
  }));
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

/** Mağazada kayıtlı ek cargoCompanyId’leri (mapping) listeye ekler — sadece yedek / geçmiş ID’ler için. */
export function mergeExtraCargoIds(
  base: CargoSelectOption[],
  extraIds: number[]
): CargoSelectOption[] {
  const extra: CargoSelectOption[] = [];
  const have = new Set(base.map((o) => o.id));
  for (const id of extraIds) {
    if (!Number.isFinite(id) || id <= 0 || have.has(id)) continue;
    have.add(id);
    const preset = trendyolCargoPresetLabel(Math.round(id));
    extra.push({
      id: Math.round(id),
      label: formatOptionLabel(preset ?? `Kayıtlı eşleştirme`, Math.round(id))
    });
  }
  return mergeCargoSelectOptions(base, extra);
}

function resolveFallbackSource(
  hasEnv: boolean,
  hasPreset: boolean,
  onlyMappingExtras: boolean
): CargoCompanySource {
  if (onlyMappingExtras && !hasEnv && !hasPreset) return "fallback-mapping";
  if (hasEnv) return "fallback-env";
  return "fallback-preset";
}

/**
 * Tek giriş noktası: kargo firmaları listesi.
 * Öncelik: DB → (boşsa) API sync → DB → env / preset yedekleri.
 */
export async function getCargoCompaniesForStore(params: {
  userId: string;
  storeId: string;
  /** false ise DB boş olsa bile sync çağrılmaz (nadiren test). @default true */
  syncIfEmpty?: boolean;
  /** Ürün eşleştirme ekranında geçmişte kullanılmış ID’leri eklemek için. */
  extraCargoCompanyIds?: number[];
}): Promise<{
  options: CargoSelectOption[];
  source: CargoCompanySource;
  syncPerformed: boolean;
  syncUpserted?: number;
  attempts?: TrendyolCarrierFetchAttempt[];
  primaryOk?: boolean;
  primaryStatus?: number;
}> {
  const extraIds = params.extraCargoCompanyIds ?? [];
  const syncIfEmpty = params.syncIfEmpty !== false;

  let syncPerformed = false;
  let syncUpserted: number | undefined;
  let attempts: TrendyolCarrierFetchAttempt[] | undefined;
  let primaryOk: boolean | undefined;
  let primaryStatus: number | undefined;

  const readDb = () =>
    prisma.marketplaceCarrier.findMany({
      where: {
        storeId: params.storeId,
        platform: "TRENDYOL",
        isActive: true
      },
      orderBy: { code: "asc" },
      select: { code: true, name: true }
    }).then(list => list.map(c => ({ cargoCompanyId: parseInt(c.code, 10), name: c.name })));

  let rows = await readDb();
  if (rows.length > 0) {
    const options = mergeExtraCargoIds(dbRowsToOptions(rows), extraIds);
    return {
      options,
      source: "db",
      syncPerformed: false
    };
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: params.storeId, platform: "trendyol" } }
  });

  if (syncIfEmpty && conn?.isActive && String(conn.sellerId ?? "").trim()) {
    try {
      const sync = await syncTrendyolCargoCompanies({
        userId: params.userId,
        storeId: params.storeId
      });
      syncPerformed = true;
      syncUpserted = sync.upserted;
      attempts = sync.attempts;
      primaryOk = sync.primaryOk;
      primaryStatus = sync.primaryStatus;

      if (sync.ok && sync.upserted > 0) {
        rows = await readDb();
      }
    } catch {
      // Sync veya DB hatası: yedek listeye düş
    }
  }

  if (rows.length > 0) {
    const options = mergeExtraCargoIds(dbRowsToOptions(rows), extraIds);
    return {
      options,
      source: "db",
      syncPerformed,
      syncUpserted,
      attempts,
      primaryOk,
      primaryStatus
    };
  }

  const envOpts = optionsFromEnv();
  const presetOpts = presetOptions();
  const hasEnv = envOpts.length > 0;
  const hasPreset = presetOpts.length > 0;

  const base = mergeCargoSelectOptions(envOpts, presetOpts);
  const options = mergeExtraCargoIds(base, extraIds);

  const onlyMappingExtras =
    base.length === 0 && options.length > 0 && extraIds.length > 0;

  const source = resolveFallbackSource(hasEnv, hasPreset, onlyMappingExtras);

  return {
    options,
    source,
    syncPerformed,
    syncUpserted,
    attempts,
    primaryOk,
    primaryStatus
  };
}
