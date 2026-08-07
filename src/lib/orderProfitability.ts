/**
 * Sipariş satırı (MarketplaceOrderLine) + eşleşen ürün (Product) bilgisinden
 * gerçek kârlılık hesaplar. Trendyol'dan gelen gerçek komisyon tutarı varsa
 * onu kullanır; yoksa çözümlenen komisyon oranı üzerinden tahmini hesaplar.
 */

export type OrderLineProfitabilityInput = {
  lineUnitPrice: number | null;
  quantity: number;
  /** Trendyol'un sipariş satırında döndürdüğü gerçek komisyon tutarı (satır toplamı) */
  marketplaceCommissionAmount: number | null;
  /** Eşleşen üründen (veya aralık/varsayılandan) çözümlenen komisyon oranı (%) */
  resolvedCommissionRate: number | null;
  /** Eşleşen üründen (veya aralık/varsayılandan) çözümlenen kargo bedeli (₺, sipariş başına) */
  resolvedCargoCost: number | null;
  /** Eşleşen ürünün maliyet fiyatı (₺, birim) */
  productCostPrice: number | null;
};

export type OrderLineProfitabilityResult = {
  matched: boolean;
  revenue: number;
  commission: number;
  commissionSource: "marketplace_actual" | "estimated" | "unknown";
  cargoCost: number;
  productCost: number;
  hasCost: boolean;
  netProfit: number | null;
  profitMarginPct: number | null;
};

export function computeOrderLineProfitability(
  input: OrderLineProfitabilityInput
): OrderLineProfitabilityResult {
  const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 1;
  const unitPrice =
    input.lineUnitPrice != null && Number.isFinite(input.lineUnitPrice) ? input.lineUnitPrice : 0;
  const revenue = Math.round(unitPrice * quantity * 100) / 100;

  let commission: number;
  let commissionSource: OrderLineProfitabilityResult["commissionSource"];
  if (input.marketplaceCommissionAmount != null && Number.isFinite(input.marketplaceCommissionAmount)) {
    commission = input.marketplaceCommissionAmount;
    commissionSource = "marketplace_actual";
  } else if (input.resolvedCommissionRate != null && Number.isFinite(input.resolvedCommissionRate)) {
    commission = (revenue * input.resolvedCommissionRate) / 100;
    commissionSource = "estimated";
  } else {
    commission = 0;
    commissionSource = "unknown";
  }
  commission = Math.round(commission * 100) / 100;

  const cargoCost =
    input.resolvedCargoCost != null && Number.isFinite(input.resolvedCargoCost)
      ? input.resolvedCargoCost
      : 0;

  const hasCost = input.productCostPrice != null && Number.isFinite(input.productCostPrice);
  const productCost = hasCost ? Math.round((input.productCostPrice as number) * quantity * 100) / 100 : 0;

  const netProfit = hasCost
    ? Math.round((revenue - commission - cargoCost - productCost) * 100) / 100
    : null;

  const profitMarginPct =
    netProfit != null && productCost + cargoCost > 0
      ? Math.round((netProfit / (productCost + cargoCost)) * 10000) / 100
      : null;

  return {
    matched: true,
    revenue,
    commission,
    commissionSource,
    cargoCost,
    productCost,
    hasCost,
    netProfit,
    profitMarginPct
  };
}

export type OrderProfitabilitySummary = {
  lineCount: number;
  matchedCount: number;
  totalRevenue: number;
  totalCommission: number;
  totalCargoCost: number;
  totalProductCost: number;
  totalNetProfit: number;
  /** Maliyeti bilinmeyen (eşleşmemiş) satır sayısı — rapor eksik olabilir uyarısı için */
  unknownCostCount: number;
};

export function summarizeOrderProfitability(
  rows: OrderLineProfitabilityResult[]
): OrderProfitabilitySummary {
  let totalRevenue = 0;
  let totalCommission = 0;
  let totalCargoCost = 0;
  let totalProductCost = 0;
  let totalNetProfit = 0;
  let matchedCount = 0;
  let unknownCostCount = 0;

  for (const r of rows) {
    totalRevenue += r.revenue;
    totalCommission += r.commission;
    totalCargoCost += r.cargoCost;
    totalProductCost += r.productCost;
    if (r.netProfit != null) {
      totalNetProfit += r.netProfit;
      matchedCount += 1;
    } else {
      unknownCostCount += 1;
    }
  }

  return {
    lineCount: rows.length,
    matchedCount,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCommission: Math.round(totalCommission * 100) / 100,
    totalCargoCost: Math.round(totalCargoCost * 100) / 100,
    totalProductCost: Math.round(totalProductCost * 100) / 100,
    totalNetProfit: Math.round(totalNetProfit * 100) / 100,
    unknownCostCount
  };
}
