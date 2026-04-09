import { TrendyolPublishRuntimeErrorCode } from "@/lib/validation/trendyolPublishErrorCodes";

/**
 * Trendyol/metin tabanlı hata çıktısını sabit iç kodlara eşler.
 */
export function mapTrendyolErrorToInternalCode(message: string): string {
  const m = message.toLowerCase();
  if (/barkod|barcode|duplicate|exists|aynı/i.test(m)) {
    return TrendyolPublishRuntimeErrorCode.TRENDYOL_INVALID_BARCODE;
  }
  if (/kategori|category/i.test(m)) {
    return TrendyolPublishRuntimeErrorCode.TRENDYOL_CATEGORY_MISSING;
  }
  if (/özellik|attribute|zorunlu/i.test(m)) {
    return TrendyolPublishRuntimeErrorCode.TRENDYOL_ATTRIBUTE_MISSING;
  }
  if (/kargo|cargo|shipment/i.test(m)) {
    return TrendyolPublishRuntimeErrorCode.TRENDYOL_CARGO_INVALID;
  }
  return TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_ITEM_FAILED;
}
