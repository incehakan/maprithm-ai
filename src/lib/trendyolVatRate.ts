/** Trendyol TR pazaryeri geçerli KDV oranları */
export const TRENDYOL_TR_VAT_RATES = [0, 1, 10, 20] as const;

export type TrendyolTrVatRate = (typeof TRENDYOL_TR_VAT_RATES)[number];

export function isValidTrendyolTrVatRate(value: number): boolean {
  return (TRENDYOL_TR_VAT_RATES as readonly number[]).includes(value);
}

/** Yuvarlanmış değer geçerli değilse kullanıcı mesajı döner */
export function validateTrendyolTrVatRate(
  value: number | null | undefined
): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (!isValidTrendyolTrVatRate(rounded)) {
    return "KDV oranı 0, 1, 10 veya 20 olmalı";
  }
  return null;
}
