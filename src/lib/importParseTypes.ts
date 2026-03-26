/** Ortak içe aktarma parse tipleri ve yardımcıları */

export type ParsedImportRecord = {
  rowIndex: number;
  raw: Record<string, unknown>;
  errorMessage?: string;
};

export const MAX_ROWS = 20_000;

/**
 * Ham kayıt: iç içe nesne/dizi değerlerini JSON string yapar (Prisma Json uyumu).
 */
export function sanitizeRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("__")) continue;
    if (v === undefined) continue;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out[k] = JSON.stringify(v);
    } else if (Array.isArray(v)) {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function capRecords(records: ParsedImportRecord[]): ParsedImportRecord[] {
  if (records.length <= MAX_ROWS) return records;
  return records.slice(0, MAX_ROWS);
}
