import { Prisma } from "@prisma/client";
import type { NormalizedCarrierCompany } from "@/lib/trendyolCarrier";
import { trendyolCargoPresetLabel } from "@/lib/trendyolCargoPresets";

export type CargoCompanyRow = {
  cargoCompanyId: number;
  name: string;
  rawData: Prisma.InputJsonValue | typeof Prisma.JsonNull;
};

/**
 * Ürün sağlayıcı (providers) yanıtından numeric cargoCompanyId + isim çıkarır.
 */
export function rowsFromProductProvidersPayload(payload: unknown): CargoCompanyRow[] {
  const arr = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];
  const out: CargoCompanyRow[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const idRaw = r.id ?? r.providerId ?? r.cargoCompanyId ?? r.code;
    const idNum = Number(idRaw);
    if (!Number.isFinite(idNum) || idNum <= 0) continue;
    const id = Math.round(idNum);
    const preset = trendyolCargoPresetLabel(id);
    const name =
      preset ||
      (typeof r.name === "string" && r.name.trim()) ||
      (typeof r.providerName === "string" && r.providerName.trim()) ||
      (typeof r.label === "string" && r.label.trim()) ||
      `Kargo ${id}`;
    out.push({
      cargoCompanyId: id,
      name: name.trim(),
      rawData: item as Prisma.InputJsonValue
    });
  }
  return dedupeRows(out);
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

export function rowsFromCarrierCompanies(
  items: NormalizedCarrierCompany[]
): CargoCompanyRow[] {
  const out: CargoCompanyRow[] = [];
  for (const it of items) {
    const id = numericIdFromCarrierRaw(it);
    if (id == null) continue;
    const preset = trendyolCargoPresetLabel(id);
    const name = preset || it.providerName.trim() || `Kargo ${id}`;
    out.push({
      cargoCompanyId: id,
      name,
      rawData: (it.rawData ?? it) as Prisma.InputJsonValue
    });
  }
  return dedupeRows(out);
}

function dedupeRows(rows: CargoCompanyRow[]): CargoCompanyRow[] {
  const m = new Map<number, CargoCompanyRow>();
  for (const r of rows) {
    if (!m.has(r.cargoCompanyId)) m.set(r.cargoCompanyId, r);
  }
  return Array.from(m.values()).sort((a, b) => a.cargoCompanyId - b.cargoCompanyId);
}
