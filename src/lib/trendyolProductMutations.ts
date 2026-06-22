import { trendyolDelete, trendyolPutJson } from "@/lib/trendyolFetch";
import { getTrendyolStorefrontCode } from "@/lib/trendyolShipmentPackages";
import {
  deleteTrendyolProductsV2,
  unlockTrendyolProduct,
  updateUnapprovedProductsOnTrendyol,
  updateApprovedProductContentOnTrendyol,
  updateApprovedProductVariantOnTrendyol,
  updateApprovedProductDeliveryOnTrendyol
} from "@/lib/trendyolProductApiV2";

export {
  unlockTrendyolProduct,
  updateUnapprovedProductsOnTrendyol,
  updateApprovedProductContentOnTrendyol,
  updateApprovedProductVariantOnTrendyol,
  updateApprovedProductDeliveryOnTrendyol,
  deleteTrendyolProductsV2
};

export async function updateProductOnTrendyol(input: {
  userId: string;
  storeId: string;
  sellerId: string;
  body: unknown;
}) {
  const path = `/integration/product/sellers/${encodeURIComponent(
    input.sellerId
  )}/products`;
  return trendyolPutJson<unknown>(
    input.userId,
    input.storeId,
    path,
    input.body
  );
}

export async function deleteTrendyolProductsOnTrendyol(input: {
  userId: string;
  storeId: string;
  sellerId: string;
  barcodes: string[];
}) {
  const path = `/integration/product/sellers/${encodeURIComponent(
    input.sellerId
  )}/products`;
  const items = input.barcodes
    .map((b) => b.trim())
    .filter(Boolean)
    .map((barcode) => ({ barcode }));
  return trendyolDelete<unknown>(input.userId, input.storeId, path, {
    body: { items },
    extraHeaders: { storeFrontCode: getTrendyolStorefrontCode() }
  });
}
