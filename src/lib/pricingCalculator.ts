export type PricingInput = {
  costPrice: number;
  commissionRate: number;
  cargoCost: number;
  vatRate: number;
  targetProfitRate: number;
};

export type PricingResult = {
  minimumProfitablePrice: number;
  suggestedPrice: number;
  estimatedProfit: number;
  estimatedProfitRate: number;
  breakdown: {
    totalCost: number;
    commissionAmount: number;
    vatAmount: number;
    netRevenue: number;
  };
};

export function calculatePricing(input: PricingInput): PricingResult {
  const {
    costPrice,
    commissionRate,
    cargoCost,
    vatRate,
    targetProfitRate
  } = input;

  const commissionDecimal = commissionRate / 100;
  const vatDecimal = vatRate / 100;
  const targetProfitDecimal = targetProfitRate / 100;

  const baseCost = costPrice + cargoCost;

  // Minimum satış fiyatı (zarar etmemek için)
  // Formül: price - (price * commission) - (price * vat / (1 + vat)) = baseCost
  // Sadeleştirme: price * (1 - commission - vat/(1+vat)) = baseCost
  // KDV dahil fiyat üzerinden komisyon alındığı varsayılıyor
  // Basit formül: minimumPrice = baseCost / (1 - commissionRate/100)
  const effectiveRate = 1 - commissionDecimal;
  const minimumProfitablePrice =
    effectiveRate > 0 ? baseCost / effectiveRate : baseCost;

  // Hedef kâr oranına göre önerilen fiyat
  // Formül: suggestedPrice = baseCost * (1 + targetProfitRate) / (1 - commissionRate)
  const suggestedPrice =
    effectiveRate > 0
      ? (baseCost * (1 + targetProfitDecimal)) / effectiveRate
      : baseCost * (1 + targetProfitDecimal);

  // Önerilen fiyat üzerinden hesaplamalar
  const commissionAmount = suggestedPrice * commissionDecimal;
  const vatAmount = (suggestedPrice * vatDecimal) / (1 + vatDecimal);
  const netRevenue = suggestedPrice - commissionAmount;
  const estimatedProfit = netRevenue - baseCost;
  const estimatedProfitRate =
    baseCost > 0 ? (estimatedProfit / baseCost) * 100 : 0;

  return {
    minimumProfitablePrice: Math.round(minimumProfitablePrice * 100) / 100,
    suggestedPrice: Math.round(suggestedPrice * 100) / 100,
    estimatedProfit: Math.round(estimatedProfit * 100) / 100,
    estimatedProfitRate: Math.round(estimatedProfitRate * 100) / 100,
    breakdown: {
      totalCost: Math.round(baseCost * 100) / 100,
      commissionAmount: Math.round(commissionAmount * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100
    }
  };
}

export function validatePricingInput(input: Partial<PricingInput>): string | null {
  if (input.costPrice === undefined || input.costPrice < 0) {
    return "Maliyet fiyatı 0 veya daha büyük olmalıdır.";
  }
  if (input.commissionRate === undefined || input.commissionRate < 0 || input.commissionRate >= 100) {
    return "Komisyon oranı 0-100 arasında olmalıdır.";
  }
  if (input.cargoCost === undefined || input.cargoCost < 0) {
    return "Kargo maliyeti 0 veya daha büyük olmalıdır.";
  }
  if (input.vatRate === undefined || input.vatRate < 0 || input.vatRate > 100) {
    return "KDV oranı 0-100 arasında olmalıdır.";
  }
  if (input.targetProfitRate === undefined || input.targetProfitRate < 0) {
    return "Hedef kâr oranı 0 veya daha büyük olmalıdır.";
  }
  return null;
}
