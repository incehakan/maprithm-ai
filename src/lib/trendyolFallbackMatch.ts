import type { PrismaClient } from "@prisma/client";
import type { TrendyolSuggestionAiParsed } from "@/lib/importTrendyolSuggestionAi";
import {
  trendyolBrandListableWhere,
  trendyolCategoryListableWhere
} from "@/lib/trendyolListable";
import { normalizeText, scoreTextMatch } from "@/lib/trendyolRuleBasedPreMatch";

/** Ürün metninde geçen anahtar → kategori adında aranacak parça (Türkçe, case-insensitive) */
const CATEGORY_KEYWORD_TO_SEARCH: Record<string, string> = {
  elbise: "elbise",
  pantolon: "pantolon",
  bluz: "bluz",
  ceket: "ceket",
  takım: "takım"
};

export type BrandFallbackResult = {
  suggestedBrandId: number | null;
  suggestedBrandName: string | null;
  /** normalizedBrand vardı ama DB'de anlamlı eşleşme yok */
  brandNotFoundNote: string | null;
  /** Özet için en iyi adaylar (skor sıralı) */
  topCandidates: Array<{ brandId: number; name: string; score: number }>;
};

export type CategoryFallbackResult = {
  top3: Array<{
    categoryId: number;
    name: string;
    isLeaf: boolean;
    score: number;
  }>;
  suggestedCategoryId: number | null;
  suggestedCategoryName: string | null;
  categoryNotFoundNote: string | null;
};

function tokenizeForContains(text: string, minLen = 2): string[] {
  const n = normalizeText(text);
  if (!n) return [];
  const raw = n.split(/\s+/).filter((p) => p.length >= minLen);
  const uniq = [...new Set(raw)];
  return uniq.slice(0, 12);
}

/**
 * TrendyolBrand: token başına case-insensitive contains (LIKE %token%).
 * En iyi skorlu kayıt önerilir; eşleşmede güven en az 50.
 */
export async function matchBrandFallback(
  db: PrismaClient,
  normalizedBrand: string | null | undefined
): Promise<BrandFallbackResult> {
  const raw = (normalizedBrand ?? "").trim();
  if (!raw) {
    return {
      suggestedBrandId: null,
      suggestedBrandName: null,
      brandNotFoundNote: null,
      topCandidates: []
    };
  }

  let tokens = tokenizeForContains(raw, 2);
  const whole = normalizeText(raw);
  if (whole.length >= 2 && !tokens.includes(whole)) {
    tokens = [whole, ...tokens].slice(0, 12);
  }
  if (tokens.length === 0) {
    return {
      suggestedBrandId: null,
      suggestedBrandName: null,
      brandNotFoundNote: "Marka eşleşmesi bulunamadı",
      topCandidates: []
    };
  }

  const rows = await db.marketplaceBrand.findMany({
    where: {
      AND: [
        { platform: "TRENDYOL", isActive: true },
        { OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" } })) }
      ]
    },
    select: { externalId: true, name: true },
    take: 120
  }).then(list => list.map(b => ({ brandId: parseInt(b.externalId, 10), name: b.name })));

  if (rows.length === 0) {
    return {
      suggestedBrandId: null,
      suggestedBrandName: null,
      brandNotFoundNote: "Marka eşleşmesi bulunamadı",
      topCandidates: []
    };
  }

  const scored = rows
    .map((r) => ({
      brandId: r.brandId,
      name: r.name,
      score: scoreTextMatch(raw, r.name)
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    return {
      suggestedBrandId: null,
      suggestedBrandName: null,
      brandNotFoundNote: "Marka eşleşmesi bulunamadı",
      topCandidates: []
    };
  }

  /* LIKE ile satır geldiyse en yüksek skorlu satırı öner; skor 0 olsa bile DB eşleşmesi vardır */
  return {
    suggestedBrandId: best.brandId,
    suggestedBrandName: best.name,
    brandNotFoundNote: null,
    topCandidates: scored.slice(0, 3)
  };
}

function collectKeywordSearchTerms(combinedNormalized: string): string[] {
  const terms = new Set<string>();
  for (const [key, search] of Object.entries(CATEGORY_KEYWORD_TO_SEARCH)) {
    if (combinedNormalized.includes(key)) {
      terms.add(search);
    }
  }
  return [...terms];
}

function pickSuggestedLeafFirst(
  top3: CategoryFallbackResult["top3"]
): CategoryFallbackResult["top3"][0] | undefined {
  if (top3.length === 0) return undefined;
  const leaf = top3.find((c) => c.isLeaf);
  return leaf ?? top3[0];
}

/**
 * TrendyolCategory: ürün adı + kategori metninden token ve keyword ile contains araması.
 * En yakın 3 sonuç; öneri yaprak öncelikli.
 */
export async function matchCategoryFallback(
  db: PrismaClient,
  normalizedCategoryText: string | null | undefined,
  normalizedName: string | null | undefined
): Promise<CategoryFallbackResult> {
  const combinedRaw = [normalizedCategoryText, normalizedName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const combined = normalizeText(combinedRaw);

  const orClauses: Array<{ name: { contains: string; mode: "insensitive" } }> =
    [];

  for (const t of tokenizeForContains(combinedRaw, 2)) {
    orClauses.push({ name: { contains: t, mode: "insensitive" } });
  }

  for (const term of collectKeywordSearchTerms(combined)) {
    orClauses.push({ name: { contains: term, mode: "insensitive" } });
  }

  if (orClauses.length === 0) {
    return {
      top3: [],
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      categoryNotFoundNote:
        "Kategori eşleşmesi bulunamadı (ürün adı veya kategori metni yetersiz)."
    };
  }

  const uniqueOr = orClauses.filter(
    (c, i, arr) =>
      arr.findIndex(
        (x) => x.name.contains === c.name.contains && x.name.mode === c.name.mode
      ) === i
  );

  const rows = await db.marketplaceCategory.findMany({
    where: {
      AND: [
        { platform: "TRENDYOL", isActive: true },
        { OR: uniqueOr.slice(0, 25) }
      ]
    },
    select: { externalId: true, name: true, metadata: true },
    take: 200
  }).then(list => list.map(c => ({
    categoryId: parseInt(c.externalId, 10),
    name: c.name,
    isLeaf: c.metadata && typeof c.metadata === "object" && (c.metadata as any).isLeaf === true
  })).filter(c => c.isLeaf));

  if (rows.length === 0) {
    return {
      top3: [],
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      categoryNotFoundNote: "Kategori eşleşmesi bulunamadı"
    };
  }

  const byId = new Map<
    number,
    { categoryId: number; name: string; isLeaf: boolean; score: number }
  >();

  for (const r of rows) {
    const s1 = scoreTextMatch(combinedRaw, r.name);
    const s2 = scoreTextMatch(combined, normalizeText(r.name));
    let score = Math.max(s1, s2);
    if (r.isLeaf) score = Math.min(100, Math.round(score * 1.06));
    const prev = byId.get(r.categoryId);
    if (!prev || score > prev.score) {
      byId.set(r.categoryId, {
        categoryId: r.categoryId,
        name: r.name,
        isLeaf: Boolean(r.isLeaf),
        score
      });
    }
  }

  const sorted = [...byId.values()].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const picked = pickSuggestedLeafFirst(top3);

  if (!picked) {
    return {
      top3,
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      categoryNotFoundNote: "Kategori eşleşmesi bulunamadı"
    };
  }

  return {
    top3,
    suggestedCategoryId: picked.categoryId,
    suggestedCategoryName: picked.name,
    categoryNotFoundNote: null
  };
}

function blendConfidence(params: {
  hasBrand: boolean;
  brandScore: number;
  hasCategory: boolean;
  categoryScore: number;
}): number {
  const brandPart = params.hasBrand
    ? Math.max(
        50,
        Math.min(
          65,
          Math.round(
            50 +
              (Math.min(100, Math.max(params.brandScore, 40)) / 100) * 15
          )
        )
      )
    : null;

  const catPart = params.hasCategory
    ? Math.min(
        70,
        Math.max(
          50,
          Math.round(
            50 +
              (Math.min(100, Math.max(params.categoryScore, 40)) / 100) * 20
          )
        )
      )
    : null;

  if (brandPart != null && catPart != null) {
    return Math.min(70, Math.round((brandPart + catPart) / 2));
  }
  if (brandPart != null) return brandPart;
  if (catPart != null) return catPart;
  return 42;
}

/**
 * OpenAI yokken: DB LIKE (contains) ile marka/kategori + keyword haritası; özet ve 40–70 güven.
 */
export async function buildTrendyolDbFallbackSuggestion(params: {
  db: PrismaClient;
  openAiReason: string;
  normalizedBrand: string | null;
  normalizedCategoryText: string | null;
  normalizedName: string | null;
}): Promise<TrendyolSuggestionAiParsed> {
  const [brandRes, catRes] = await Promise.all([
    matchBrandFallback(params.db, params.normalizedBrand),
    matchCategoryFallback(
      params.db,
      params.normalizedCategoryText,
      params.normalizedName
    )
  ]);

  const bestBrandScore = brandRes.topCandidates[0]?.score ?? 0;
  const bestCatScore = catRes.top3[0]?.score ?? 0;

  const hasBrand = brandRes.suggestedBrandId != null;
  const hasCategory = catRes.suggestedCategoryId != null;

  let confidenceScore = blendConfidence({
    hasBrand,
    brandScore: bestBrandScore,
    hasCategory,
    categoryScore: bestCatScore
  });

  if (!hasBrand && !hasCategory) {
    confidenceScore = Math.min(45, Math.max(40, confidenceScore));
  } else {
    confidenceScore = Math.min(70, Math.max(40, confidenceScore));
  }

  const parts: string[] = [
    "Fallback: kural bazlı eşleştirme kullanıldı (veritabanı LIKE / anahtar kelime).",
    `OpenAI kullanılamadı veya geçersiz yanıt: ${params.openAiReason}`
  ];

  if (brandRes.brandNotFoundNote) {
    parts.push(brandRes.brandNotFoundNote);
  } else if (hasBrand) {
    parts.push(
      `Marka (DB eşleşmesi): ${brandRes.suggestedBrandName} (id ${brandRes.suggestedBrandId}).`
    );
    if (brandRes.topCandidates.length > 1) {
      parts.push(
        `Diğer adaylar: ${brandRes.topCandidates
          .slice(1, 3)
          .map((b) => `${b.name} (${b.score})`)
          .join("; ")}`
      );
    }
  } else if (!(params.normalizedBrand ?? "").trim()) {
    parts.push("Marka alanı boş; marka önerisi atlandı.");
  }

  if (catRes.categoryNotFoundNote) {
    parts.push(catRes.categoryNotFoundNote);
  } else if (hasCategory) {
    parts.push(
      `Kategori (en yakın 3): ${catRes.top3
        .map(
          (c) =>
            `${c.name} (id ${c.categoryId}, yaprak:${c.isLeaf ? "evet" : "hayır"}, skor ${c.score})`
        )
        .join("; ")}.`
    );
  }

  if (!hasBrand && !hasCategory) {
    parts.push(
      "Ne marka ne kategori otomatik seçilebildi; katalog senkronu veya içe aktarma alanlarını kontrol edin."
    );
  }

  return {
    suggestedBrandId: brandRes.suggestedBrandId,
    suggestedBrandName: brandRes.suggestedBrandName,
    suggestedCategoryId: catRes.suggestedCategoryId,
    suggestedCategoryName: catRes.suggestedCategoryName,
    confidenceScore,
    aiReasoningSummary: parts.join(" ").slice(0, 4000)
  };
}
