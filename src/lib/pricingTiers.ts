/**
 * Maliyet fiyatı aralığına göre komisyon/kargo/kâr oranı çözümleme.
 *
 * Öncelik sırası (ürün publish/fiyat hesaplama akışlarında kullanılır):
 *   1) Ürün bazlı override (Product.commissionRate / cargoCost / targetProfitRate) — doluysa kullan
 *   2) Maliyet fiyatının düştüğü PricingTier — varsa kullan
 *   3) Mağaza varsayılanı (UserSettings.defaultCommissionRate vb.)
 */

export type PricingTierLike = {
  id: string;
  label: string | null;
  minCostPrice: number;
  maxCostPrice: number | null;
  commissionRate: number;
  cargoCost: number;
  targetProfitRate: number;
  isActive: boolean;
};

export type PricingTierInput = {
  label?: string | null;
  minCostPrice: number;
  maxCostPrice?: number | null;
  commissionRate: number;
  cargoCost: number;
  targetProfitRate: number;
  isActive?: boolean;
};

/** Aralık girdisini doğrular; hata varsa mesaj döner, yoksa null. */
export function validatePricingTierInput(input: PricingTierInput): string | null {
  if (input.minCostPrice == null || !Number.isFinite(input.minCostPrice) || input.minCostPrice < 0) {
    return "Alt sınır (min. maliyet fiyatı) 0 veya daha büyük bir sayı olmalı.";
  }
  if (
    input.maxCostPrice != null &&
    (!Number.isFinite(input.maxCostPrice) || input.maxCostPrice <= input.minCostPrice)
  ) {
    return "Üst sınır, alt sınırdan büyük olmalı (boş bırakılırsa 've üzeri' anlamına gelir).";
  }
  if (
    input.commissionRate == null ||
    !Number.isFinite(input.commissionRate) ||
    input.commissionRate < 0 ||
    input.commissionRate >= 100
  ) {
    return "Komisyon oranı 0-99 arasında olmalı.";
  }
  if (input.cargoCost == null || !Number.isFinite(input.cargoCost) || input.cargoCost < 0) {
    return "Kargo bedeli 0 veya daha büyük olmalı.";
  }
  if (
    input.targetProfitRate == null ||
    !Number.isFinite(input.targetProfitRate) ||
    input.targetProfitRate < 0
  ) {
    return "Hedef kâr oranı 0 veya daha büyük olmalı.";
  }
  return null;
}

/**
 * Yeni/güncellenen bir aralığın, aynı mağazadaki diğer aktif aralıklarla çakışıp
 * çakışmadığını kontrol eder. Çakışma varsa true döner.
 */
export function pricingTierOverlaps(
  candidate: { minCostPrice: number; maxCostPrice: number | null },
  existing: PricingTierLike[],
  excludeId?: string
): PricingTierLike | null {
  const candMax = candidate.maxCostPrice ?? Number.POSITIVE_INFINITY;
  for (const tier of existing) {
    if (!tier.isActive) continue;
    if (excludeId && tier.id === excludeId) continue;
    const tierMax = tier.maxCostPrice ?? Number.POSITIVE_INFINITY;
    const overlap = candidate.minCostPrice <= tierMax && tier.minCostPrice <= candMax;
    if (overlap) return tier;
  }
  return null;
}

/**
 * Maliyet fiyatına göre eşleşen aralığı bulur. Birden fazla eşleşme varsa
 * (normalde olmamalı, validasyon engeller) en dar aralığı seçer.
 */
export function findMatchingPricingTier(
  tiers: PricingTierLike[],
  costPrice: number
): PricingTierLike | null {
  if (!Number.isFinite(costPrice) || costPrice < 0) return null;

  const candidates = tiers.filter((t) => {
    if (!t.isActive) return false;
    const max = t.maxCostPrice ?? Number.POSITIVE_INFINITY;
    return costPrice >= t.minCostPrice && costPrice <= max;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return candidates.reduce((best, cur) => {
    const bestWidth = (best.maxCostPrice ?? Number.POSITIVE_INFINITY) - best.minCostPrice;
    const curWidth = (cur.maxCostPrice ?? Number.POSITIVE_INFINITY) - cur.minCostPrice;
    return curWidth < bestWidth ? cur : best;
  });
}

export type PricingFieldSource = "product_override" | "tier" | "store_default";

export type ResolvedPricingField = {
  value: number | null;
  source: PricingFieldSource | null;
};

export type ResolveEffectivePricingInputsParams = {
  costPrice: number | null;
  productOverrides: {
    commissionRate: number | null;
    cargoCost: number | null;
    targetProfitRate: number | null;
  };
  storeDefaults: {
    commissionRate: number | null;
    cargoCost: number | null;
    targetProfitRate: number | null;
  };
  tiers: PricingTierLike[];
};

export type ResolveEffectivePricingInputsResult = {
  commissionRate: ResolvedPricingField;
  cargoCost: ResolvedPricingField;
  targetProfitRate: ResolvedPricingField;
  matchedTier: PricingTierLike | null;
};

function resolveField(
  overrideValue: number | null,
  tierValue: number | null,
  storeDefaultValue: number | null
): ResolvedPricingField {
  if (overrideValue != null && Number.isFinite(overrideValue)) {
    return { value: overrideValue, source: "product_override" };
  }
  if (tierValue != null && Number.isFinite(tierValue)) {
    return { value: tierValue, source: "tier" };
  }
  if (storeDefaultValue != null && Number.isFinite(storeDefaultValue)) {
    return { value: storeDefaultValue, source: "store_default" };
  }
  return { value: null, source: null };
}

/**
 * Ürün bazlı override > aralık eşleşmesi > mağaza varsayılanı önceliğiyle
 * komisyon/kargo/kâr oranını çözümler.
 */
export function resolveEffectivePricingInputs(
  params: ResolveEffectivePricingInputsParams
): ResolveEffectivePricingInputsResult {
  const { costPrice, productOverrides, storeDefaults, tiers } = params;

  const matchedTier =
    costPrice != null ? findMatchingPricingTier(tiers, costPrice) : null;

  return {
    commissionRate: resolveField(
      productOverrides.commissionRate,
      matchedTier?.commissionRate ?? null,
      storeDefaults.commissionRate
    ),
    cargoCost: resolveField(
      productOverrides.cargoCost,
      matchedTier?.cargoCost ?? null,
      storeDefaults.cargoCost
    ),
    targetProfitRate: resolveField(
      productOverrides.targetProfitRate,
      matchedTier?.targetProfitRate ?? null,
      storeDefaults.targetProfitRate
    ),
    matchedTier
  };
}

/** Aralık için otomatik görünen etiket üretir, örn. "0 - 100 ₺" veya "500 ₺ ve üzeri". */
export function buildPricingTierLabel(tier: {
  minCostPrice: number;
  maxCostPrice: number | null;
}): string {
  if (tier.maxCostPrice == null) {
    return `${tier.minCostPrice.toLocaleString("tr-TR")} ₺ ve üzeri`;
  }
  return `${tier.minCostPrice.toLocaleString("tr-TR")} - ${tier.maxCostPrice.toLocaleString("tr-TR")} ₺`;
}
