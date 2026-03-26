import type { ParsedXmlFeedRow } from "@/lib/xmlFeedParser";
import type { ProductMatchCandidate } from "@/lib/xmlFeedDiff";
import { hashesFromXmlRow, hashesFromProductSnapshot } from "@/lib/xmlProductHashes";

export type ProductWithHashes = ProductMatchCandidate & {
  priceHash: string | null;
  stockHash: string | null;
  contentHash: string | null;
};

export type XmlFeedSmartBucket =
  | "skippedNoChange"
  | "priceOnly"
  | "stockOnly"
  | "priceAndStock"
  | "contentChanged";

export type XmlFeedSmartItemBase = {
  row: ParsedXmlFeedRow;
  product: ProductWithHashes;
  nextPrice: number;
  nextStock: number;
  mergedImages: string[];
  incoming: { priceHash: string; stockHash: string; contentHash: string };
  existing: { priceHash: string; stockHash: string; contentHash: string };
};

export type XmlFeedSmartDiffResult = {
  newProducts: Array<{ row: ParsedXmlFeedRow }>;
  skippedNoChange: XmlFeedSmartItemBase[];
  priceOnly: XmlFeedSmartItemBase[];
  stockOnly: XmlFeedSmartItemBase[];
  priceAndStock: XmlFeedSmartItemBase[];
  contentChanged: XmlFeedSmartItemBase[];
  missingFromFeed: ProductWithHashes[];
  matchedCount: number;
};

function normalizeKey(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function pickRowIdentifier(row: ParsedXmlFeedRow): string {
  return (
    normalizeKey(row.normalizedSku) ||
    normalizeKey(row.normalizedBarcode) ||
    normalizeKey(row.normalizedName)
  );
}

function classifyMatched(item: XmlFeedSmartItemBase): XmlFeedSmartBucket {
  const { incoming, existing } = item;
  const contentChanged = incoming.contentHash !== existing.contentHash;
  if (contentChanged) return "contentChanged";

  const priceChanged = incoming.priceHash !== existing.priceHash;
  const stockChanged = incoming.stockHash !== existing.stockHash;

  if (!priceChanged && !stockChanged) return "skippedNoChange";
  if (priceChanged && stockChanged) return "priceAndStock";
  if (priceChanged) return "priceOnly";
  return "stockOnly";
}

export function buildXmlFeedSmartDiff(params: {
  rows: ParsedXmlFeedRow[];
  products: ProductWithHashes[];
}): XmlFeedSmartDiffResult {
  const bySku = new Map<string, ProductWithHashes>();
  const byBarcode = new Map<string, ProductWithHashes>();
  const byStockCode = new Map<string, ProductWithHashes>();
  const byName = new Map<string, ProductWithHashes>();

  for (const p of params.products) {
    const sku = normalizeKey(p.sku);
    const barcode = normalizeKey(p.mappingBarcode);
    const stockCode = normalizeKey(p.mappingStockCode);
    const name = normalizeKey(p.name);
    if (sku) bySku.set(sku, p);
    if (barcode) byBarcode.set(barcode, p);
    if (stockCode) byStockCode.set(stockCode, p);
    if (name) byName.set(name, p);
  }

  const result: XmlFeedSmartDiffResult = {
    newProducts: [],
    skippedNoChange: [],
    priceOnly: [],
    stockOnly: [],
    priceAndStock: [],
    contentChanged: [],
    missingFromFeed: [],
    matchedCount: 0
  };

  const matchedProductIds = new Set<string>();
  const feedIdentifierSet = new Set<string>();

  for (const row of params.rows) {
    const sku = normalizeKey(row.normalizedSku);
    const barcode = normalizeKey(row.normalizedBarcode);
    const name = normalizeKey(row.normalizedName);
    const rowIdentifier = pickRowIdentifier(row);
    if (rowIdentifier) feedIdentifierSet.add(rowIdentifier);

    const matched =
      (sku ? bySku.get(sku) : undefined) ??
      (barcode ? byBarcode.get(barcode) : undefined) ??
      (sku ? byStockCode.get(sku) : undefined) ??
      (name ? byName.get(name) : undefined);

    if (!matched) {
      result.newProducts.push({ row });
      continue;
    }

    matchedProductIds.add(matched.id);
    result.matchedCount += 1;

    const snap = hashesFromProductSnapshot({
      name: matched.name,
      description: matched.description,
      brand: matched.brand,
      sku: matched.sku,
      mainImageUrl: matched.mainImageUrl,
      imageUrls: matched.imageUrls,
      price: matched.price,
      stock: matched.stock
    });

    const existing = {
      priceHash: matched.priceHash ?? snap.priceHash,
      stockHash: matched.stockHash ?? snap.stockHash,
      contentHash: matched.contentHash ?? snap.contentHash
    };

    const fromRow = hashesFromXmlRow(row, matched.price, matched.stock);
    const base: XmlFeedSmartItemBase = {
      row,
      product: matched,
      nextPrice: fromRow.nextPrice,
      nextStock: fromRow.nextStock,
      mergedImages: fromRow.mergedImages,
      incoming: {
        priceHash: fromRow.priceHash,
        stockHash: fromRow.stockHash,
        contentHash: fromRow.contentHash
      },
      existing
    };

    const bucket = classifyMatched(base);
    switch (bucket) {
      case "skippedNoChange":
        result.skippedNoChange.push(base);
        break;
      case "priceOnly":
        result.priceOnly.push(base);
        break;
      case "stockOnly":
        result.stockOnly.push(base);
        break;
      case "priceAndStock":
        result.priceAndStock.push(base);
        break;
      default:
        result.contentChanged.push(base);
    }
  }

  for (const product of params.products) {
    const productIdentifier =
      normalizeKey(product.sku) ||
      normalizeKey(product.mappingBarcode) ||
      normalizeKey(product.mappingStockCode) ||
      normalizeKey(product.name);

    if (!productIdentifier) continue;
    if (!matchedProductIds.has(product.id) && !feedIdentifierSet.has(productIdentifier)) {
      result.missingFromFeed.push(product);
    }
  }

  return result;
}
