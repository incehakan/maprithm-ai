import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { getUserSettings } from "@/lib/userSettings";
import { calculatePricing, validatePricingInput } from "@/lib/pricingCalculator";
import {
  resolveEffectivePricingInputs,
  buildPricingTierLabel,
  type PricingTierLike
} from "@/lib/pricingTiers";
import { isFeatureEnabled, FEATURE_FLAGS } from "@/lib/featureFlags";

export type AutoPricingApplyResult =
  | { applied: false; reason: string }
  | {
      applied: true;
      previousPrice: number;
      newPrice: number;
      tierId: string | null;
      tierLabel: string | null;
    };

/**
 * PRICING_TIER_AUTO_APPLY flag'i açık mağazalarda, Trendyol'a yayınlamadan hemen önce
 * çağrılır: ürünün maliyet fiyatına göre doğru aralığı (veya ürün bazlı override'ı,
 * yoksa mağaza varsayılanını) bulup satış fiyatını yeniden hesaplar ve Product.price'a yazar.
 * Flag kapalıysa hiçbir şey yapmadan döner (öneri modunda kullanıcı elle uygular).
 */
export async function applyAutoPricingIfEnabled(params: {
  userId: string;
  storeId: string;
  membershipId?: string | null;
  productId: string;
}): Promise<AutoPricingApplyResult> {
  const { userId, storeId, membershipId, productId } = params;

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { featureFlags: true }
  });
  if (!store || !isFeatureEnabled(store, FEATURE_FLAGS.PRICING_TIER_AUTO_APPLY)) {
    return { applied: false, reason: "Otomatik fiyatlandırma modu kapalı." };
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, userId, storeId }
  });
  if (!product) {
    return { applied: false, reason: "Ürün bulunamadı." };
  }

  const p = product as typeof product & {
    costPrice: number | null;
    commissionRate: number | null;
    cargoCost: number | null;
    vatRate: number | null;
    targetProfitRate: number | null;
  };

  if (p.costPrice == null || !Number.isFinite(p.costPrice) || p.costPrice < 0) {
    return { applied: false, reason: "Maliyet fiyatı (costPrice) tanımlı değil." };
  }

  const anyPrisma = prisma as any;
  const tierRows: PricingTierLike[] =
    anyPrisma.pricingTier && typeof anyPrisma.pricingTier.findMany === "function"
      ? await anyPrisma.pricingTier.findMany({
          where: { storeId, isActive: true }
        })
      : [];

  const settings = await getUserSettings({ userId, storeId });

  const resolved = resolveEffectivePricingInputs({
    costPrice: p.costPrice,
    productOverrides: {
      commissionRate: p.commissionRate,
      cargoCost: p.cargoCost,
      targetProfitRate: p.targetProfitRate
    },
    storeDefaults: {
      commissionRate: settings.defaultCommissionRate,
      cargoCost: settings.defaultCargoCost,
      targetProfitRate: settings.defaultTargetProfitRate
    },
    tiers: tierRows
  });

  if (resolved.commissionRate.value == null || resolved.cargoCost.value == null) {
    return {
      applied: false,
      reason:
        "Komisyon oranı veya kargo bedeli çözümlenemedi (ne ürün override'ı, ne aralık, ne mağaza varsayılanı tanımlı)."
    };
  }

  const vatRate =
    p.vatRate != null && Number.isFinite(p.vatRate) ? p.vatRate : settings.defaultVatRate ?? 20;
  const targetProfitRate =
    resolved.targetProfitRate.value != null ? resolved.targetProfitRate.value : 0;

  const pricingInput = {
    costPrice: p.costPrice,
    commissionRate: resolved.commissionRate.value,
    cargoCost: resolved.cargoCost.value,
    vatRate,
    targetProfitRate
  };

  const validationError = validatePricingInput(pricingInput);
  if (validationError) {
    return { applied: false, reason: `Hesaplama girdisi geçersiz: ${validationError}` };
  }

  const result = calculatePricing(pricingInput);
  const previousPrice = Number(product.price);
  const newPrice = result.suggestedPrice;

  if (Math.abs(newPrice - previousPrice) < 0.01) {
    return { applied: false, reason: "Hesaplanan fiyat mevcut fiyatla aynı, güncelleme gerekmedi." };
  }

  await prisma.product.updateMany({
    where: { id: productId, userId, storeId },
    data: { price: newPrice }
  });

  const tierLabel = resolved.matchedTier ? buildPricingTierLabel(resolved.matchedTier) : null;

  await createActivityLog({
    userId,
    storeId,
    membershipId: membershipId ?? undefined,
    action: "PRICING_TIER_AUTO_APPLIED",
    entityType: "product",
    entityId: productId,
    message: `Otomatik kademeli fiyatlandırma uygulandı: ₺${previousPrice} → ₺${newPrice}${
      tierLabel ? ` (aralık: ${tierLabel})` : " (mağaza varsayılanı)"
    }`
  });

  return {
    applied: true,
    previousPrice,
    newPrice,
    tierId: resolved.matchedTier?.id ?? null,
    tierLabel
  };
}
