import { createHash } from "crypto";
import type { ParsedXmlFeedRow } from "@/lib/xmlFeedParser";
import { normalizeImageUrls } from "@/lib/productImages";

export function shortHash(utf8: string): string {
  return createHash("sha256").update(utf8, "utf8").digest("hex").slice(0, 32);
}

export function hashPrice(value: number): string {
  return shortHash(`p:${Number(value).toFixed(4)}`);
}

export function hashStock(value: number): string {
  return shortHash(`s:${Math.round(value)}`);
}

export function hashContentFromParts(parts: {
  name: string;
  description: string;
  brand: string;
  sku: string;
  mainImageUrl: string;
  imageUrlsJoined: string;
}): string {
  return shortHash(
    `c:${parts.name.trim().toLowerCase()}|${parts.description.trim().toLowerCase()}|${parts.brand.trim().toLowerCase()}|${parts.sku.trim().toLowerCase()}|${parts.mainImageUrl.trim()}|${parts.imageUrlsJoined}`
  );
}

export function mergedImageListFromRow(row: ParsedXmlFeedRow): string[] {
  return normalizeImageUrls([row.mainImageUrl ?? null, row.imageUrls ?? null]);
}

export function hashesFromXmlRow(
  row: ParsedXmlFeedRow,
  fallbackPrice: number,
  fallbackStock: number
): { priceHash: string; stockHash: string; contentHash: string; nextPrice: number; nextStock: number; mergedImages: string[] } {
  const nextPrice =
    row.price != null && Number.isFinite(row.price) ? Number(row.price) : fallbackPrice;
  const nextStock =
    row.stock != null && Number.isFinite(row.stock)
      ? Math.round(row.stock)
      : Math.round(fallbackStock);

  const mergedImages = mergedImageListFromRow(row);
  const mainImage = mergedImages[0] ?? (row.mainImageUrl ?? "").trim();
  const imageJoined = mergedImages.map((x) => x.trim()).filter(Boolean).join("|");

  const name = (row.normalizedName ?? "").trim() || "—";
  const desc = (row.normalizedDescription ?? "").trim();
  const brand = (row.normalizedBrand ?? "").trim();
  const sku = (row.normalizedSku ?? "").trim();

  return {
    nextPrice,
    nextStock,
    mergedImages,
    priceHash: hashPrice(nextPrice),
    stockHash: hashStock(nextStock),
    contentHash: hashContentFromParts({
      name,
      description: desc,
      brand,
      sku,
      mainImageUrl: mainImage,
      imageUrlsJoined: imageJoined
    })
  };
}

export function hashesFromProductSnapshot(p: {
  name: string;
  description: string | null;
  brand: string | null;
  sku: string | null;
  mainImageUrl: string | null;
  imageUrls: unknown;
  price: number;
  stock: number;
}): { priceHash: string; stockHash: string; contentHash: string } {
  const imgs = normalizeImageUrls([
    p.mainImageUrl,
    Array.isArray(p.imageUrls) ? (p.imageUrls as string[]) : null
  ]);
  const imageJoined = imgs.map((x) => x.trim()).filter(Boolean).join("|");
  const mainImage = imgs[0] ?? (p.mainImageUrl ?? "").trim();

  return {
    priceHash: hashPrice(p.price),
    stockHash: hashStock(p.stock),
    contentHash: hashContentFromParts({
      name: p.name || "—",
      description: (p.description ?? "").trim(),
      brand: (p.brand ?? "").trim(),
      sku: (p.sku ?? "").trim(),
      mainImageUrl: mainImage,
      imageUrlsJoined: imageJoined
    })
  };
}
