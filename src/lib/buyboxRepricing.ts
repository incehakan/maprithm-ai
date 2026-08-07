import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { fetchTrendyolBuyboxInfo, type TrendyolBuyboxInfo } from "@/lib/trendyolBuybox";
import { pushPriceStockUpdateToTrendyol } from "@/lib/trendyolPriceStockPush";

export type BuyboxCheckRow = {
  productId: string;
  productName: string;
  barcode: string;
  ourPrice: number;
  buyboxOrder: number | null;
  buyboxPrice: number | null;
  hasMultipleSeller: boolean;
  secondBuyboxPrice: number | null;
  thirdBuyboxPrice: number | null;
  winningBuybox: boolean;
  gapToWin: number | null;
};

export type BuyboxCheckResult = {
  checkedCount: number;
  winningCount: number;
  losingCount: number;
  noCompetitionCount: number;
  rows: BuyboxCheckRow[];
};

/**
 * Mağazadaki tüm yayında (published) Trendyol mapping'leri için buybox
 * bilgisini çeker, ProductMarketplaceMapping'e anlık görüntü olarak yazar.
 * Sadece izleme yapar; fiyat değiştirmez.
 */
export async function runBuyboxCheckForStore(params: {
  userId: string;
  storeId: string;
  membershipId?: string | null;
}): Promise<BuyboxCheckResult> {
  const mappings = await prisma.productMarketplaceMapping.findMany({
    where: {
      storeId: params.storeId,
      platform: "trendyol",
      publishStatus: "published",
      barcode: { not: null }
    },
    include: { product: true }
  });

  const barcodeToMapping = new Map<string, (typeof mappings)[number]>();
  for (const m of mappings) {
    if (m.barcode) barcodeToMapping.set(m.barcode.trim(), m);
  }

  const barcodes = Array.from(barcodeToMapping.keys());
  const rows: BuyboxCheckRow[] = [];

  if (barcodes.length === 0) {
    return { checkedCount: 0, winningCount: 0, losingCount: 0, noCompetitionCount: 0, rows: [] };
  }

  const res = await fetchTrendyolBuyboxInfo({
    userId: params.userId,
    storeId: params.storeId,
    barcodes
  });

  if (!res.ok) {
    throw new Error(res.message);
  }

  const infoByBarcode = new Map<string, TrendyolBuyboxInfo>();
  for (const info of res.results) {
    infoByBarcode.set(info.barcode.trim(), info);
  }

  let winningCount = 0;
  let losingCount = 0;
  let noCompetitionCount = 0;
  const now = new Date();

  for (const [barcode, mapping] of barcodeToMapping) {
    const info = infoByBarcode.get(barcode);
    if (!info) continue;

    await prisma.productMarketplaceMapping.update({
      where: { id: mapping.id },
      data: {
        buyboxOrder: info.buyboxOrder,
        buyboxPrice: info.buyboxPrice,
        hasMultipleSeller: info.hasMultipleSeller,
        secondBuyboxPrice: info.secondBuyboxPrice,
        thirdBuyboxPrice: info.thirdBuyboxPrice,
        buyboxCheckedAt: now
      }
    });

    const ourPrice = Number(mapping.product.price);
    const winning = info.buyboxOrder === 1;
    if (!info.hasMultipleSeller) noCompetitionCount += 1;
    else if (winning) winningCount += 1;
    else losingCount += 1;

    const gapToWin =
      !winning && info.buyboxPrice != null ? Math.round((ourPrice - info.buyboxPrice) * 100) / 100 : null;

    rows.push({
      productId: mapping.productId,
      productName: mapping.product.name,
      barcode,
      ourPrice,
      buyboxOrder: info.buyboxOrder,
      buyboxPrice: info.buyboxPrice,
      hasMultipleSeller: info.hasMultipleSeller,
      secondBuyboxPrice: info.secondBuyboxPrice,
      thirdBuyboxPrice: info.thirdBuyboxPrice,
      winningBuybox: winning,
      gapToWin
    });
  }

  await createActivityLog({
    userId: params.userId,
    storeId: params.storeId,
    membershipId: params.membershipId ?? undefined,
    action: "BUYBOX_CHECK_COMPLETED",
    entityType: "store",
    entityId: params.storeId,
    message: `Buybox kontrolü: ${rows.length} ürün tarandı — ${winningCount} kazanıyor, ${losingCount} kaybediyor, ${noCompetitionCount} rakipsiz.`
  });

  return {
    checkedCount: rows.length,
    winningCount,
    losingCount,
    noCompetitionCount,
    rows
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Otomatik yeniden fiyatlandırma (repricing)
// ─────────────────────────────────────────────────────────────────────────

export type RepricingStrategy = "undercut_amount" | "undercut_percent" | "match_buybox";

export type ComputeRepriceTargetInput = {
  buyboxOrder: number | null;
  buyboxPrice: number | null;
  hasMultipleSeller: boolean;
  currentPrice: number;
  costPrice: number | null;
  strategy: RepricingStrategy;
  undercutValue: number;
  minMarginPct: number | null;
  /** Ürüne özel taban fiyat override'ı (varsa marj hesaplamasından daha güçlü bir taban) */
  productMinPrice: number | null;
};

export type ComputeRepriceTargetResult = {
  newPrice: number | null;
  changed: boolean;
  reason: string;
};

/**
 * Buybox bilgisine göre yeni fiyat hesaplar. Güvenlik katmanları:
 *  - Zaten kazanıyorsak veya rakip yoksa dokunmaz.
 *  - Hesaplanan hedef, maliyet üzerinden korunan minimum kâr marjının altına inemez.
 *  - Ürüne özel taban fiyat (varsa) hiçbir zaman ihlal edilmez.
 *  - Hedef fiyat mevcut fiyattan yüksekse (yani zaten daha ucuzuz) değişiklik yapılmaz.
 */
export function computeRepriceTarget(input: ComputeRepriceTargetInput): ComputeRepriceTargetResult {
  if (!input.hasMultipleSeller) {
    return { newPrice: null, changed: false, reason: "Rakip yok, fiyat değiştirilmedi." };
  }
  if (input.buyboxOrder === 1) {
    return { newPrice: null, changed: false, reason: "Zaten buybox'ı kazanıyor." };
  }
  if (input.buyboxPrice == null || !Number.isFinite(input.buyboxPrice)) {
    return { newPrice: null, changed: false, reason: "Buybox fiyatı bilinmiyor." };
  }

  let target: number;
  switch (input.strategy) {
    case "undercut_percent":
      target = input.buyboxPrice * (1 - input.undercutValue / 100);
      break;
    case "match_buybox":
      target = input.buyboxPrice;
      break;
    case "undercut_amount":
    default:
      target = input.buyboxPrice - input.undercutValue;
      break;
  }

  // Güvenlik tabanı 1: maliyet üzerinden minimum kâr marjı
  if (input.costPrice != null && input.minMarginPct != null) {
    const marginFloor = input.costPrice * (1 + input.minMarginPct / 100);
    if (target < marginFloor) {
      target = marginFloor;
    }
  }

  // Güvenlik tabanı 2: ürüne özel taban fiyat
  if (input.productMinPrice != null && target < input.productMinPrice) {
    target = input.productMinPrice;
  }

  target = Math.round(target * 100) / 100;

  if (target <= 0) {
    return { newPrice: null, changed: false, reason: "Hesaplanan fiyat geçersiz (0 veya altı)." };
  }

  // Hedef zaten mevcut fiyattan yüksek/eşitse (biz zaten ucuzuz ama sırada değiliz — veri gecikmesi olabilir) dokunma
  if (target >= input.currentPrice) {
    return {
      newPrice: null,
      changed: false,
      reason: "Hesaplanan hedef mevcut fiyattan düşük değil, değişiklik gerekmedi."
    };
  }

  return { newPrice: target, changed: true, reason: "Buybox'ı kazanmak için fiyat düşürüldü." };
}

export type BuyboxRepriceRow = {
  productId: string;
  productName: string;
  previousPrice: number;
  newPrice: number | null;
  applied: boolean;
  reason: string;
  pushError?: string;
};

export type BuyboxRepriceResult = {
  evaluatedCount: number;
  appliedCount: number;
  skippedCount: number;
  failedPushCount: number;
  rows: BuyboxRepriceRow[];
};

/**
 * Önce buybox kontrolünü çalıştırır (anlık görüntüyü tazeler), sonra
 * autoRepriceEnabled=true olan ürünler için yeni fiyat hesaplayıp hem
 * Product.price'a hem Trendyol'a (price-and-inventory) yazar.
 * Mağaza genel ayarı (isActive) kapalıysa hiçbir şey yapmaz.
 */
export async function runBuyboxAutoRepriceForStore(params: {
  userId: string;
  storeId: string;
  membershipId?: string | null;
}): Promise<BuyboxRepriceResult> {
  const anyPrisma = prisma as any;
  const settings = anyPrisma.buyboxRepricingSettings
    ? await anyPrisma.buyboxRepricingSettings.findUnique({ where: { storeId: params.storeId } })
    : null;

  if (!settings?.isActive) {
    return { evaluatedCount: 0, appliedCount: 0, skippedCount: 0, failedPushCount: 0, rows: [] };
  }

  // 1) Anlık görüntüyü tazele
  await runBuyboxCheckForStore(params);

  // 2) Otomatik yeniden fiyatlandırma açık ürünleri çek (tazelenmiş buybox verisiyle)
  const mappings = await prisma.productMarketplaceMapping.findMany({
    where: {
      storeId: params.storeId,
      platform: "trendyol",
      publishStatus: "published",
      autoRepriceEnabled: true,
      buyboxCheckedAt: { not: null }
    },
    include: { product: true }
  });

  const rows: BuyboxRepriceRow[] = [];
  let appliedCount = 0;
  let skippedCount = 0;
  let failedPushCount = 0;

  const strategy = (settings.strategy as RepricingStrategy) ?? "undercut_amount";

  for (const m of mappings) {
    const currentPrice = Number(m.product.price);
    const costPrice = (m.product as unknown as { costPrice: number | null }).costPrice;

    const calc = computeRepriceTarget({
      buyboxOrder: m.buyboxOrder,
      buyboxPrice: m.buyboxPrice,
      hasMultipleSeller: m.hasMultipleSeller ?? false,
      currentPrice,
      costPrice,
      strategy,
      undercutValue: settings.undercutValue ?? 1,
      minMarginPct: settings.minMarginPct ?? null,
      productMinPrice: m.repriceMinPrice ?? null
    });

    if (!calc.changed || calc.newPrice == null) {
      skippedCount += 1;
      rows.push({
        productId: m.productId,
        productName: m.product.name,
        previousPrice: currentPrice,
        newPrice: null,
        applied: false,
        reason: calc.reason
      });
      continue;
    }

    await prisma.product.updateMany({
      where: { id: m.productId, storeId: params.storeId },
      data: { price: calc.newPrice }
    });

    const pushResult = await pushPriceStockUpdateToTrendyol({
      userId: params.userId,
      storeId: params.storeId,
      membershipId: params.membershipId,
      productId: m.productId
    });

    if (!pushResult.ok) {
      failedPushCount += 1;
      rows.push({
        productId: m.productId,
        productName: m.product.name,
        previousPrice: currentPrice,
        newPrice: calc.newPrice,
        applied: false,
        reason: "Fiyat hesaplandı ama Trendyol'a gönderilemedi.",
        pushError: pushResult.error
      });
      continue;
    }

    appliedCount += 1;
    rows.push({
      productId: m.productId,
      productName: m.product.name,
      previousPrice: currentPrice,
      newPrice: calc.newPrice,
      applied: true,
      reason: calc.reason
    });

    await createActivityLog({
      userId: params.userId,
      storeId: params.storeId,
      membershipId: params.membershipId ?? undefined,
      action: "BUYBOX_AUTO_REPRICED",
      entityType: "product",
      entityId: m.productId,
      message: `Buybox otomatik yeniden fiyatlandırma: ₺${currentPrice} → ₺${calc.newPrice} (${m.product.name})`
    });
  }

  return {
    evaluatedCount: mappings.length,
    appliedCount,
    skippedCount,
    failedPushCount,
    rows
  };
}
