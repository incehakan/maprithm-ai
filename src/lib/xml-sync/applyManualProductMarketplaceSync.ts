import type { TrendyolPublishPipelineResult } from "@/lib/trendyolPublishProductPipeline";
import {
  markMarketplaceSyncFailed,
  markMarketplaceSyncPending,
  markMarketplaceSyncSuccess
} from "./marketplaceSyncState";
import type { MarketplaceSyncSourceValue } from "./types";

/**
 * Manuel Trendyol publish / içerik güncelleme pipeline sonucunu Product.marketplaceSync* alanlarına yazar.
 * Mapping.lastPublish* ayrı kalır.
 */
export async function applyPublishPipelineResultToProductMarketplaceSync(params: {
  productId: string;
  storeId: string;
  userId: string;
  membershipId: string | null;
  result: TrendyolPublishPipelineResult;
  source: MarketplaceSyncSourceValue;
}): Promise<void> {
  const { productId, storeId, userId, membershipId, result, source } = params;

  if (!result.ok) {
    await markMarketplaceSyncFailed({
      productId,
      storeId,
      source,
      errorMessage: result.error,
      userId,
      membershipId
    });
    return;
  }

  const r = result.batch.results[0];
  if (r?.status === "SUCCESS") {
    await markMarketplaceSyncSuccess({
      productId,
      storeId,
      source,
      userId,
      membershipId
    });
  } else if (r?.status === "FAILED") {
    await markMarketplaceSyncFailed({
      productId,
      storeId,
      source,
      errorMessage: r.errorMessage ?? "İşlem başarısız.",
      userId,
      membershipId
    });
  } else {
    await markMarketplaceSyncPending({
      productId,
      storeId,
      source,
      userId,
      membershipId,
      log: false
    });
  }
}
