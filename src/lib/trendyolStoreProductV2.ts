import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS, isFeatureEnabled } from "@/lib/featureFlags";

/** Mağaza PRODUCT_V2 feature flag'i açık mı? */
export async function isStoreProductV2Enabled(storeId: string): Promise<boolean> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { featureFlags: true }
  });
  return store ? isFeatureEnabled(store, FEATURE_FLAGS.PRODUCT_V2) : false;
}

/** Herhangi bir aktif mağazada PRODUCT_V2 açık mı? (global referans senkronu için) */
export async function anyStoreProductV2Enabled(): Promise<boolean> {
  const stores = await prisma.store.findMany({
    where: { status: "active" },
    select: { featureFlags: true }
  });
  return stores.some((s) => isFeatureEnabled(s, FEATURE_FLAGS.PRODUCT_V2));
}
