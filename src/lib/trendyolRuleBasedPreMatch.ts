/**
 * Trendyol marka/kategori için AI öncesi kural tabanlı aday üretimi.
 * Veri: TrendyolBrand, TrendyolCategory (senkron tablolar).
 */

export type TrendyolBrandRow = { brandId: number; name: string };
export type TrendyolCategoryRow = {
  categoryId: number;
  name: string;
  isLeaf: boolean;
};

export type ScoredBrandCandidate = {
  brandId: number;
  name: string;
  score: number;
};

export type ScoredCategoryCandidate = {
  categoryId: number;
  name: string;
  isLeaf: boolean;
  score: number;
};

export type BasicProductSignals = {
  /** normalizeText uygulanmış ürün adı */
  nameNormalized: string;
  /** normalizeText uygulanmış açıklama (kısaltılmış) */
  descriptionNormalized: string;
  /** normalizeText(marka metni) */
  brandTextNormalized: string;
  /** normalizeText(kategori metni) */
  categoryTextNormalized: string;
  /** Ad + açıklama birleşik arama metni (kategori adayı için) */
  combinedSearchText: string;
  /** Anlamlı kelime parçaları (tekrarsız) */
  tokens: string[];
};

/** Metin normalizasyonu: küçük harf, aksan kaldırma, harf/rakam/boşluk dışını atma */
export function normalizeText(input: string | null | undefined): string {
  if (input == null) return "";
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ğüşıöçâîû\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * 0–100 skor: tam eşleşme, içerme, Levenshtein oranı, ortak token oranı.
 */
export function scoreTextMatch(query: string, target: string): number {
  const q = normalizeText(query);
  const t = normalizeText(target);
  if (!q || !t) return 0;
  if (q === t) return 100;
  if (t.includes(q)) return 92;
  if (q.includes(t) && t.length >= 3) return 88;
  const dist = levenshtein(q, t);
  const maxLen = Math.max(q.length, t.length, 1);
  const levRatio = 1 - dist / maxLen;
  const levScore = Math.round(levRatio * 75);

  const qTokens = new Set(q.split(" ").filter((x) => x.length >= 2));
  const tTokens = t.split(" ").filter((x) => x.length >= 2);
  if (qTokens.size && tTokens.length) {
    let hit = 0;
    for (const tok of tTokens) {
      if (qTokens.has(tok)) hit += 1;
      else {
        for (const qt of qTokens) {
          if (tok.includes(qt) || qt.includes(tok)) {
            hit += 0.5;
            break;
          }
        }
      }
    }
    const tokenScore = Math.min(
      90,
      Math.round((hit / Math.max(qTokens.size, 1)) * 35)
    );
    return Math.max(levScore, tokenScore);
  }

  return levScore;
}

function uniqueTokens(...parts: string[]): string[] {
  const set = new Set<string>();
  for (const p of parts) {
    const n = normalizeText(p);
    for (const w of n.split(" ")) {
      if (w.length >= 2) set.add(w);
    }
  }
  return [...set];
}

/**
 * Ürün adı, açıklama, marka ve kategori metninden sinyaller çıkarır.
 */
export function extractBasicProductSignals(
  normalizedName: string | null | undefined,
  normalizedDescription: string | null | undefined,
  normalizedBrand: string | null | undefined,
  normalizedCategoryText: string | null | undefined
): BasicProductSignals {
  const nameN = normalizeText(normalizedName ?? "");
  const descRaw = normalizedDescription ?? "";
  const descN = normalizeText(descRaw).slice(0, 500);
  const brandN = normalizeText(normalizedBrand ?? "");
  const catN = normalizeText(normalizedCategoryText ?? "");

  const combinedSearchText = normalizeText(
    [nameN, descN, catN].filter(Boolean).join(" ")
  );

  const tokens = uniqueTokens(nameN, descN, brandN, catN);

  return {
    nameNormalized: nameN,
    descriptionNormalized: descN,
    brandTextNormalized: brandN,
    categoryTextNormalized: catN,
    combinedSearchText,
    tokens
  };
}

function narrowBrandPool(
  brands: TrendyolBrandRow[],
  query: string,
  maxPool: number
): TrendyolBrandRow[] {
  const q = normalizeText(query);
  if (!q || brands.length <= maxPool) return brands;

  const tokens = q.split(" ").filter((t) => t.length >= 2);
  const filtered = brands.filter((b) => {
    const t = normalizeText(b.name);
    if (t.includes(q) || q.includes(t)) return true;
    return tokens.some((tok) => t.includes(tok));
  });

  return filtered.length > 0 ? filtered.slice(0, maxPool * 2) : brands.slice(0, maxPool);
}

function narrowCategoryPool(
  categories: TrendyolCategoryRow[],
  query: string,
  maxPool: number
): TrendyolCategoryRow[] {
  const q = normalizeText(query);
  if (!q || categories.length <= maxPool) return categories;

  const tokens = q.split(" ").filter((t) => t.length >= 2);
  const filtered = categories.filter((c) => {
    const t = normalizeText(c.name);
    if (t.includes(q) || q.includes(t)) return true;
    return tokens.some((tok) => t.includes(tok));
  });

  return filtered.length > 0 ? filtered.slice(0, maxPool * 2) : categories.slice(0, maxPool);
}

/**
 * Marka adayları: sorgu metnine göre skorla, en yüksek `limit` adet.
 */
export function findBrandCandidates(
  brands: TrendyolBrandRow[],
  query: string | null | undefined,
  limit = 5
): ScoredBrandCandidate[] {
  const q = (query ?? "").trim();
  if (!q) return [];

  const pool = narrowBrandPool(brands, q, 1200);
  const scored = pool.map((b) => ({
    brandId: b.brandId,
    name: b.name,
    score: scoreTextMatch(q, b.name)
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((x) => x.score > 0).slice(0, limit);
  return top;
}

/**
 * Kategori adayları (yaprak öncelikli bonus).
 */
export function findCategoryCandidates(
  categories: TrendyolCategoryRow[],
  query: string | null | undefined,
  limit = 5
): ScoredCategoryCandidate[] {
  const q = (query ?? "").trim();
  if (!q) return [];

  const pool = narrowCategoryPool(categories, q, 2000);
  const scored = pool.map((c) => {
    let score = scoreTextMatch(q, c.name);
    if (c.isLeaf) score = Math.min(100, Math.round(score * 1.08));
    return {
      categoryId: c.categoryId,
      name: c.name,
      isLeaf: c.isLeaf,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((x) => x.score > 0).slice(0, limit);
}

/**
 * Birden fazla sorgu (kategori metni + ad/açıklama) sonuçlarını birleştirir; categoryId başına en iyi skor.
 */
export function mergeCategoryCandidates(
  categories: TrendyolCategoryRow[],
  queries: Array<string | null | undefined>,
  limit = 5
): ScoredCategoryCandidate[] {
  const byId = new Map<number, ScoredCategoryCandidate>();

  for (const rawQ of queries) {
    const q = (rawQ ?? "").trim();
    if (!q) continue;
    const found = findCategoryCandidates(categories, q, limit * 2);
    for (const c of found) {
      const prev = byId.get(c.categoryId);
      if (!prev || c.score > prev.score) {
        byId.set(c.categoryId, c);
      }
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Aday skorunu 0–1 aralığına indirger (API yanıtı için) */
export function scoreToUnit(score: number): number {
  return Math.round((Math.min(100, Math.max(0, score)) / 100) * 1000) / 1000;
}
