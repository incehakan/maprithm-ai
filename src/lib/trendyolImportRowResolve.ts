/**
 * İçe aktarma satırından Trendyol mapping alanları (barkod, stok kodu, product main id).
 */

export function compactBarcodeFromImportRowId(rowId: string): string {
  const hex = rowId.replace(/-/g, "").slice(0, 14);
  return `IMP${hex}`.slice(0, 20);
}

/**
 * Barkod: normalizedBarcode → normalizedSku → satır id fallback
 */
export function resolveTrendyolBarcodeForImportRow(row: {
  id: string;
  normalizedBarcode: string | null;
  normalizedSku: string | null;
}): string {
  const b = row.normalizedBarcode?.trim();
  if (b) return b.slice(0, 64);
  const s = row.normalizedSku?.trim();
  if (s) return s.slice(0, 64);
  return compactBarcodeFromImportRowId(row.id);
}

/**
 * Stok kodu: normalizedSku → fallback
 */
export function resolveTrendyolStockCodeForImportRow(
  row: { rowIndex: number; normalizedSku: string | null },
  importJobId: string
): string {
  const sku = row.normalizedSku?.trim();
  if (sku) return sku.slice(0, 128);
  const jobShort = importJobId.replace(/-/g, "").slice(0, 8);
  return `IMP-${jobShort}-${row.rowIndex}`.slice(0, 128);
}

export function buildProductMainId(productId: string): string {
  return `MAPRITHM-${productId}`;
}
