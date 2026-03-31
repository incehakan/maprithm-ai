import { parseImportBuffer } from "@/lib/importFileParser";
import { normalizeImportRow } from "@/lib/importNormalize";
import { fetchWithTimeoutAndRetry } from "@/lib/httpClient";

export type ParsedXmlFeedRow = {
  rowIndex: number;
  raw: Record<string, unknown>;
  normalizedName?: string;
  normalizedDescription?: string;
  normalizedBrand?: string;
  normalizedSku?: string;
  normalizedBarcode?: string;
  mainImageUrl?: string;
  imageUrls?: string[];
  price?: number;
  stock?: number;
};

export async function fetchAndParseXmlFeed(
  feedUrl: string
): Promise<ParsedXmlFeedRow[]> {
  const res = await fetchWithTimeoutAndRetry(
    feedUrl,
    { cache: "no-store" },
    { timeoutMs: 20_000, maxRetries: 2, requestName: "xmlFeedParser:fetch" }
  );
  if (!res.ok) {
    throw new Error(`XML feed alınamadı: HTTP ${res.status}`);
  }
  const xmlText = await res.text();
  if (!xmlText.trim()) {
    throw new Error("XML feed boş döndü.");
  }

  const parsedRows = parseImportBuffer(Buffer.from(xmlText, "utf8"), "xml");
  const normalizedRows: ParsedXmlFeedRow[] = [];

  for (const row of parsedRows) {
    const normalized = normalizeImportRow(row.raw);
    normalizedRows.push({
      rowIndex: row.rowIndex,
      raw: row.raw,
      normalizedName: normalized.normalizedName,
      normalizedDescription: normalized.normalizedDescription,
      normalizedBrand: normalized.normalizedBrand,
      normalizedSku: normalized.normalizedSku,
      normalizedBarcode: normalized.normalizedBarcode,
      mainImageUrl: normalized.mainImageUrl,
      imageUrls: normalized.imageUrls,
      price: normalized.price,
      stock: normalized.stock
    });
  }

  return normalizedRows;
}
