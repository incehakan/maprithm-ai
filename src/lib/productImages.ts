import { normalizeFieldKey } from "./importFlexibleFieldMap";

const IMAGE_ALIASES = [
  "image",
  "imageUrl",
  "mainImage",
  "mainImageUrl",
  "images",
  "image1",
  "image2",
  "image3",
  "picture",
  "pictures",
  "resim",
  "resimler",
  "urunResimleri"
];

function toStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => toStringArray(v));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      toStringArray(v)
    );
  }

  const text = String(value).trim();
  if (!text) return [];

  if (
    (text.startsWith("[") && text.endsWith("]")) ||
    (text.startsWith("{") && text.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(text);
      return toStringArray(parsed);
    } catch {
      // fall through
    }
  }

  return text
    .split(/[,\n;|]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isLikelyImageUrl(url: string): boolean {
  const s = url.trim().toLowerCase();
  return s.startsWith("http://") || s.startsWith("https://");
}

export function normalizeImageUrls(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const v of values) {
    const parts = toStringArray(v);
    for (const p of parts) {
      const trimmed = p.trim();
      if (!trimmed) continue;
      if (!isLikelyImageUrl(trimmed)) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export function extractImageUrls(raw: Record<string, unknown>): string[] {
  const aliasSet = new Set(IMAGE_ALIASES.map((a) => normalizeFieldKey(a)));
  const picked: unknown[] = [];

  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeFieldKey(k);
    if (aliasSet.has(nk)) {
      picked.push(v);
      continue;
    }
    if (/^image\d+$/.test(nk) || /^resim\d+$/.test(nk) || /^picture\d+$/.test(nk)) {
      picked.push(v);
      continue;
    }
    if (nk.includes("image") || nk.includes("picture") || nk.includes("resim")) {
      picked.push(v);
    }
  }

  return normalizeImageUrls(picked);
}

export function extractImageUrlsFromXmlRow(rawData: unknown): string[] {
  const urls: unknown[] = [];

  function walk(node: unknown): void {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;

    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const nk = normalizeFieldKey(k);

      if (
        nk === "pictures" ||
        nk === "picture" ||
        nk === "images" ||
        nk === "image" ||
        nk === "resimler" ||
        nk === "resim" ||
        nk === "urunresimleri"
      ) {
        urls.push(v);
      }

      walk(v);
    }
  }

  walk(rawData);
  return normalizeImageUrls(urls);
}

export function buildMarketplaceImages(input: {
  mainImageUrl?: string | null;
  imageUrls?: unknown;
}): Array<{ url: string }> {
  const normalized = normalizeImageUrls([
    input.mainImageUrl ?? null,
    input.imageUrls ?? null
  ]);
  return normalized.map((url) => ({ url }));
}
