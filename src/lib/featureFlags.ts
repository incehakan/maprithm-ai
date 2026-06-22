import type { Store } from "@prisma/client";

export const FEATURE_FLAGS = {
  ORIGIN_FIELD: "origin_field_enabled",
  PRODUCT_V2: "product_v2_enabled",
  ORDER_STREAM: "order_stream_enabled"
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

type StoreWithFlags = Pick<Store, "featureFlags"> | { featureFlags?: unknown };

/**
 * Mağaza featureFlags JSON'unda flagKey: true ise true döner; yoksa false (varsayılan kapalı).
 */
export function isFeatureEnabled(
  store: StoreWithFlags,
  flagKey: FeatureFlagKey | string
): boolean {
  const flags = store.featureFlags;
  if (flags == null || typeof flags !== "object" || Array.isArray(flags)) {
    return false;
  }
  return (flags as Record<string, unknown>)[flagKey] === true;
}
