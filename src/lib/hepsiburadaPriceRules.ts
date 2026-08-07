/**
 * Hepsiburada fiyat aralığı (OutOfPriceRange) kuralları.
 *
 * Kaynak: developers.hepsiburada.com — ürün fiyat/stok kuralları
 * (ortalama listelenmiş fiyata göre max tavan yüzdeleri).
 *
 * Katalog import ve listing inventory-uploads aynı tabloyu kullanır.
 */

export type HbPriceRangeTier = {
  /** Ortalama fiyat alt sınırı (dahil), TL */
  minExclusive: number;
  /** Ortalama fiyat üst sınırı (hariç); Infinity = üst yok */
  maxExclusive: number;
  /** Ortalamanın üzerine izin verilen max artış oranı (örn. 2.5 = %250) */
  maxIncreaseRatio: number;
};

/** Ortalama fiyat dilimine göre izin verilen max tavan oranı */
export const HB_PRICE_RANGE_TIERS: readonly HbPriceRangeTier[] = [
  { minExclusive: 0, maxExclusive: 50, maxIncreaseRatio: 2.5 },
  { minExclusive: 50, maxExclusive: 100, maxIncreaseRatio: 1.5 },
  { minExclusive: 100, maxExclusive: 200, maxIncreaseRatio: 1.2 },
  { minExclusive: 200, maxExclusive: 500, maxIncreaseRatio: 1.0 },
  { minExclusive: 500, maxExclusive: 2000, maxIncreaseRatio: 0.9 },
  { minExclusive: 2000, maxExclusive: Number.POSITIVE_INFINITY, maxIncreaseRatio: 0.8 },
] as const;

export type HbPriceRangeEvaluation = {
  ok: boolean;
  averagePrice: number;
  price: number;
  maxAllowed: number;
  tierPercent: number;
  reason?: string;
};

/**
 * `price`'ın, HB'nin hesapladığı `averagePrice` ortalamasına göre tavanın
 * içinde olup olmadığını değerlendirir.
 *
 * Not: Ortalamayı yalnızca HB bilir; istemci tarafında yalnızca bilinen
 * referans ortalama ile ön-kontrol için kullanılır. Asıl karar API'den
 * (`OutOfPriceRange` / `priceValidations`) gelir.
 */
export function evaluateHbPriceRange(
  price: number,
  averagePrice: number
): HbPriceRangeEvaluation {
  if (!Number.isFinite(price) || price < 0) {
    return {
      ok: false,
      averagePrice,
      price,
      maxAllowed: 0,
      tierPercent: 0,
      reason: "Geçersiz fiyat.",
    };
  }
  if (!Number.isFinite(averagePrice) || averagePrice < 0) {
    return {
      ok: false,
      averagePrice,
      price,
      maxAllowed: 0,
      tierPercent: 0,
      reason: "Geçersiz ortalama fiyat.",
    };
  }

  const tier =
    HB_PRICE_RANGE_TIERS.find(
      (t) => averagePrice >= t.minExclusive && averagePrice < t.maxExclusive
    ) ?? HB_PRICE_RANGE_TIERS[HB_PRICE_RANGE_TIERS.length - 1]!;

  const maxAllowed = averagePrice * (1 + tier.maxIncreaseRatio);
  const ok = price <= maxAllowed + 1e-9;
  return {
    ok,
    averagePrice,
    price,
    maxAllowed,
    tierPercent: Math.round(tier.maxIncreaseRatio * 100),
    reason: ok
      ? undefined
      : `OutOfPriceRange: fiyat ${price} > izin verilen tavan ${maxAllowed.toFixed(2)} (ortalama ${averagePrice}, +%${Math.round(tier.maxIncreaseRatio * 100)}).`,
  };
}
