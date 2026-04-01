import { XMLParser } from "fast-xml-parser";
import {
  type ParsedImportRecord,
  capRecords,
  sanitizeRecord
} from "./importParseTypes";
import { extractImageUrlsFromXmlRow } from "./productImages";

/** Tekrarlanan veya tekil urun satiri kok etiketleri (kucuk harf) */
const PRODUCT_LIKE_KEYS = new Set([
  "product",
  "products",
  "item",
  "items",
  "row",
  "rows",
  "record",
  "records",
  "entry",
  "entries",
  "offer",
  "article",
  "sku",
  "line",
  "orderitem",
  "orderitems",
  "urun",
  "urunler"
]);

function objectToFlatRecord(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "#text") {
      if (v != null && String(v).trim()) out["value"] = v;
      continue;
    }
    if (k.startsWith("@_")) {
      const plain = k.slice(2);
      if (plain) out[plain] = v;
      continue;
    }
    if (v == null) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const nested = objectToFlatRecord(v as Record<string, unknown>);
      for (const [nk, nv] of Object.entries(nested)) {
        const key = nk === "value" ? k : `${k}_${nk}`;
        if (out[key] === undefined) out[key] = nv;
      }
    } else if (!Array.isArray(v)) {
      out[k] = v;
    }
  }
  return out;
}

function findFirstObjectArray(node: unknown, depth = 0): unknown[] | null {
  if (depth > 14) return null;
  if (Array.isArray(node)) {
    if (
      node.length > 0 &&
      node.every((x) => x != null && typeof x === "object" && !Array.isArray(x))
    ) {
      return node;
    }
    for (const item of node) {
      const inner = findFirstObjectArray(item, depth + 1);
      if (inner) return inner;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      const inner = findFirstObjectArray(v, depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

function findSingletonProductRows(root: Record<string, unknown>): unknown[] | null {
  for (const [key, val] of Object.entries(root)) {
    const lk = key.toLowerCase();
    if (!PRODUCT_LIKE_KEYS.has(lk)) continue;
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      return [val];
    }
  }
  return null;
}

function decorateWithImages(
  originalRow: Record<string, unknown>,
  flatRow: Record<string, unknown>
): Record<string, unknown> {
  const imageUrls = extractImageUrlsFromXmlRow(originalRow);
  if (imageUrls.length === 0) return flatRow;
  return {
    ...flatRow,
    mainImageUrl: imageUrls[0],
    imageUrls
  };
}

function extractXmlRowObjects(root: unknown): Record<string, unknown>[] {
  if (!root || typeof root !== "object") return [];

  const asRoot = root as Record<string, unknown>;

  const fromArray = findFirstObjectArray(root);
  if (fromArray && fromArray.length > 0) {
    return fromArray.map((item) => {
      const original = item as Record<string, unknown>;
      const flat = objectToFlatRecord(original);
      return decorateWithImages(original, flat);
    });
  }

  const single = findSingletonProductRows(asRoot);
  if (single && single.length > 0) {
    return single.map((item) => {
      const original = item as Record<string, unknown>;
      const flat = objectToFlatRecord(original);
      return decorateWithImages(original, flat);
    });
  }

  return [decorateWithImages(asRoot, objectToFlatRecord(asRoot))];
}

/** fast-xml-parser varsayılanı maxTotalExpansions=1000; büyük feed'lerde &amp; vb. çok olduğunda "Entity expansion limit exceeded" oluşur. */
const XML_ENTITY_LIMITS = {
  maxTotalExpansions: 50_000_000,
  maxEntityCount: 500_000,
  maxEntitySize: 500_000,
  maxExpansionDepth: 32,
  maxExpandedLength: 500_000_000
} as const;

export function parseXmlBuffer(buffer: Buffer): ParsedImportRecord[] {
  const xml = buffer.toString("utf8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    processEntities: {
      enabled: true,
      ...XML_ENTITY_LIMITS
    }
  });

  let root: unknown;
  try {
    root = parser.parse(xml);
  } catch (e) {
    return [
      {
        rowIndex: 0,
        raw: {},
        errorMessage: e instanceof Error ? e.message : "XML ayrıştırılamadı"
      }
    ];
  }

  const rows = extractXmlRowObjects(root);
  if (rows.length === 0) return [];

  const records: ParsedImportRecord[] = rows.map((raw, i) => ({
    rowIndex: i,
    raw: sanitizeRecord(raw)
  }));

  return capRecords(records);
}
