import { trendyolPutJson } from "@/lib/trendyolFetch";
import { archiveProductOnTrendyolV2 } from "@/lib/trendyolProductApiV2";
import { isStoreProductV2Enabled } from "@/lib/trendyolStoreProductV2";

export async function archiveProductOnTrendyol(input: {
  userId: string;
  storeId: string;
  sellerId: string;
  barcode: string;
  archived: boolean;
}) {
  if (await isStoreProductV2Enabled(input.storeId)) {
    return archiveProductOnTrendyolV2(input);
  }

  const path = `/integration/product/sellers/${encodeURIComponent(
    input.sellerId
  )}/products/archive-state`;

  const payload = {
    items: [
      {
        barcode: input.barcode,
        archived: input.archived
      }
    ]
  };

  return trendyolPutJson<unknown>(input.userId, input.storeId, path, payload);
}
