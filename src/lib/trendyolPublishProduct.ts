import { trendyolPostJson } from "@/lib/trendyolFetch";

export async function publishProductToTrendyol(input: {
  userId: string;
  storeId: string;
  sellerId: string;
  body: unknown;
}) {
  const path = `/integration/product/sellers/${encodeURIComponent(
    input.sellerId
  )}/products`;
  return trendyolPostJson<unknown>(input.userId, input.storeId, path, input.body);
}
