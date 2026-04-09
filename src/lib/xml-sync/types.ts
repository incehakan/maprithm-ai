/** Panel (DB) ile Trendyol marketplace hizalama özeti — Product.marketplaceSyncStatus */
export type MarketplaceSyncStatus = "SYNCED" | "FAILED" | "PENDING" | "NOT_APPLICABLE";

/** Product.marketplaceSyncSource — XML / manuel işlem kökeni */
export const MarketplaceSyncSource = {
  XML_PRICE_UPDATE: "XML_PRICE_UPDATE",
  XML_STOCK_UPDATE: "XML_STOCK_UPDATE",
  XML_PRICE_STOCK_UPDATE: "XML_PRICE_STOCK_UPDATE",
  XML_CONTENT_UPDATE: "XML_CONTENT_UPDATE",
  MANUAL_PUBLISH: "MANUAL_PUBLISH",
  MANUAL_CONTENT_UPDATE: "MANUAL_CONTENT_UPDATE",
  MANUAL_PRICE_STOCK_UPDATE: "MANUAL_PRICE_STOCK_UPDATE"
} as const;

export type MarketplaceSyncSourceValue =
  (typeof MarketplaceSyncSource)[keyof typeof MarketplaceSyncSource];

export interface ProductSyncState {
  productId: string;
  lastXmlSyncAt?: string | Date | null;
  lastMarketplaceSyncAt?: string | Date | null;
  marketplaceSyncStatus?: MarketplaceSyncStatus | null;
  marketplaceSyncError?: string | null;
  marketplaceSyncSource?: string | null;
}
