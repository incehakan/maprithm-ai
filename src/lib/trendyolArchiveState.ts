import { trendyolPutJson } from "@/lib/trendyolFetch";

export async function archiveProductOnTrendyol(input: {
  userId: string;
  storeId: string;
  sellerId: string;
  barcode: string;
  archived: boolean;
}) {
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
