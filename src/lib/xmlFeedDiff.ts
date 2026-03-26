import type { ParsedXmlFeedRow } from "@/lib/xmlFeedParser";

export type ProductMatchCandidate = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  sku: string | null;
  brand: string | null;
  mainImageUrl: string | null;
  imageUrls: string[] | null;
  mappingBarcode: string | null;
  mappingStockCode: string | null;
  mappingPublishStatus: string | null;
};

type DiffBucket = "newProducts" | "changedPriceOrStock" | "changedContent" | "unchanged";

export type XmlFeedDiffResult = {
  newProducts: Array<{ row: ParsedXmlFeedRow }>;
  changedPriceOrStock: Array<{ row: ParsedXmlFeedRow; product: ProductMatchCandidate }>;
  changedContent: Array<{ row: ParsedXmlFeedRow; product: ProductMatchCandidate }>;
  unchanged: Array<{ row: ParsedXmlFeedRow; product: ProductMatchCandidate }>;
  missingFromFeed: ProductMatchCandidate[];
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

function hasDifferentText(a?: string | null, b?: string | null): boolean {
  return normalizeKey(a) !== normalizeKey(b);
}

function hasDifferentImages(a?: string[] | null, b?: string[] | null): boolean {
  const left = (a ?? []).map((x) => x.trim()).filter(Boolean).join("|");
  const right = (b ?? []).map((x) => x.trim()).filter(Boolean).join("|");
  return left !== right;
}

function classifyDiff(row: ParsedXmlFeedRow, product: ProductMatchCandidate): DiffBucket {
  const priceChanged =
    row.price != null && Number.isFinite(row.price) && Number(row.price) !== product.price;
  const stockChanged =
    row.stock != null && Number.isFinite(row.stock) && Math.round(row.stock) !== product.stock;

  if (priceChanged || stockChanged) {
    return "changedPriceOrStock";
  }

  const contentChanged =
    hasDifferentText(row.normalizedName, product.name) ||
    hasDifferentText(row.normalizedDescription, product.description) ||
    hasDifferentText(row.normalizedBrand, product.brand) ||
    hasDifferentText(row.normalizedSku, product.sku) ||
    hasDifferentText(row.mainImageUrl, product.mainImageUrl) ||
    hasDifferentImages(row.imageUrls ?? null, product.imageUrls ?? null);

  if (contentChanged) {
    return "changedContent";
  }
  return "unchanged";
}

export function buildXmlFeedDiff(params: {
  rows: ParsedXmlFeedRow[];
  products: ProductMatchCandidate[];
}): XmlFeedDiffResult {
  const bySku = new Map<string, ProductMatchCandidate>();
  const byBarcode = new Map<string, ProductMatchCandidate>();
  const byStockCode = new Map<string, ProductMatchCandidate>();
  const byName = new Map<string, ProductMatchCandidate>();

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

  const result: XmlFeedDiffResult = {
    newProducts: [],
    changedPriceOrStock: [],
    changedContent: [],
    unchanged: [],
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

    const bucket = classifyDiff(row, matched);
    if (bucket === "changedPriceOrStock") result.changedPriceOrStock.push({ row, product: matched });
    else if (bucket === "changedContent") result.changedContent.push({ row, product: matched });
    else result.unchanged.push({ row, product: matched });
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
