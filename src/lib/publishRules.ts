/**
 * Mağaza bazlı yayın kısıtlama kuralları — belirlenen eşiklerin dışında kalan
 * ürünlerin Trendyol'a (veya ileride başka pazaryerlerine) gönderilmesini engeller.
 */

export type PublishRuleLike = {
  minStock: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  isActive: boolean;
};

export type PublishRuleCheckResult =
  | { blocked: false }
  | { blocked: true; reason: string };

/**
 * Ürünün yayın kurallarını geçip geçmediğini kontrol eder.
 * Kural yoksa veya pasifse her zaman blocked: false döner.
 */
export function evaluatePublishRuleGate(
  product: { price: number; stock: number },
  rule: PublishRuleLike | null
): PublishRuleCheckResult {
  if (!rule || !rule.isActive) return { blocked: false };

  if (rule.minStock != null && product.stock < rule.minStock) {
    return {
      blocked: true,
      reason: `Stok (${product.stock}) belirlenen minimum stok kuralının (${rule.minStock}) altında.`
    };
  }
  if (rule.minPrice != null && product.price < rule.minPrice) {
    return {
      blocked: true,
      reason: `Fiyat (₺${product.price}) belirlenen minimum fiyat kuralının (₺${rule.minPrice}) altında.`
    };
  }
  if (rule.maxPrice != null && product.price > rule.maxPrice) {
    return {
      blocked: true,
      reason: `Fiyat (₺${product.price}) belirlenen maksimum fiyat kuralının (₺${rule.maxPrice}) üstünde.`
    };
  }

  return { blocked: false };
}

export function validatePublishRuleInput(input: {
  minStock: number | null;
  minPrice: number | null;
  maxPrice: number | null;
}): string | null {
  if (input.minStock != null && (!Number.isFinite(input.minStock) || input.minStock < 0)) {
    return "Minimum stok 0 veya daha büyük bir tam sayı olmalı.";
  }
  if (input.minPrice != null && (!Number.isFinite(input.minPrice) || input.minPrice < 0)) {
    return "Minimum fiyat 0 veya daha büyük olmalı.";
  }
  if (input.maxPrice != null && (!Number.isFinite(input.maxPrice) || input.maxPrice < 0)) {
    return "Maksimum fiyat 0 veya daha büyük olmalı.";
  }
  if (
    input.minPrice != null &&
    input.maxPrice != null &&
    input.maxPrice <= input.minPrice
  ) {
    return "Maksimum fiyat, minimum fiyattan büyük olmalı.";
  }
  return null;
}
