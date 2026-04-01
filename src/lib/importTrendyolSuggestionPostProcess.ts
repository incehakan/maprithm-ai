import type { TrendyolSuggestionAiParsed } from "@/lib/importTrendyolSuggestionAi";
import { normalizeText } from "@/lib/trendyolRuleBasedPreMatch";

type BrandCandidate = { brandId: number; name: string; score: number };
type CategoryCandidate = {
  categoryId: number;
  name: string;
  isLeaf: boolean;
  score: number;
};

export type SuggestionPostProcessInput = {
  suggestion: TrendyolSuggestionAiParsed;
  normalizedBrand: string | null;
  normalizedCategoryText: string | null;
  normalizedName: string | null;
  brandCandidates: BrandCandidate[];
  categoryCandidates: CategoryCandidate[];
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}

function tokenOverlapRatio(a: string, b: string): number {
  const at = new Set(normalizeText(a).split(" ").filter((x) => x.length >= 2));
  const bt = new Set(normalizeText(b).split(" ").filter((x) => x.length >= 2));
  if (at.size === 0 || bt.size === 0) return 0;
  let hit = 0;
  for (const t of at) if (bt.has(t)) hit += 1;
  return hit / Math.max(at.size, bt.size);
}

function findBrandScore(
  id: number | null,
  candidates: BrandCandidate[]
): number {
  if (id == null) return 0;
  const c = candidates.find((x) => x.brandId === id);
  return c?.score ?? 0;
}

function findCategoryScore(
  id: number | null,
  candidates: CategoryCandidate[]
): number {
  if (id == null) return 0;
  const c = candidates.find((x) => x.categoryId === id);
  return c?.score ?? 0;
}

/**
 * XML'e özel olmayan, genel AI sonrası kalite kapısı:
 * - düşük skorlu seçimi güçlü adayla değiştirir
 * - boş kalan alanları güvenli eşiklerde top adayla doldurur
 * - confidence'i aday skoru + token uyumu ile yeniden kalibre eder
 */
export function postProcessTrendyolSuggestion(
  input: SuggestionPostProcessInput
): TrendyolSuggestionAiParsed {
  const out: TrendyolSuggestionAiParsed = {
    ...input.suggestion
  };

  const notes: string[] = [];

  const topBrand = input.brandCandidates[0] ?? null;
  const topCategory = input.categoryCandidates[0] ?? null;

  const selectedBrandScore = findBrandScore(
    out.suggestedBrandId,
    input.brandCandidates
  );
  const selectedCategoryScore = findCategoryScore(
    out.suggestedCategoryId,
    input.categoryCandidates
  );

  // 1) Marka: AI boş bıraktıysa ve güçlü aday varsa doldur.
  if (out.suggestedBrandId == null && topBrand && topBrand.score >= 72) {
    out.suggestedBrandId = topBrand.brandId;
    out.suggestedBrandName = topBrand.name;
    notes.push(`Marka top adaydan dolduruldu (${topBrand.name}).`);
  }

  // 2) Kategori: AI boş bıraktıysa ve güçlü aday varsa doldur.
  if (out.suggestedCategoryId == null && topCategory && topCategory.score >= 72) {
    out.suggestedCategoryId = topCategory.categoryId;
    out.suggestedCategoryName = topCategory.name;
    notes.push(`Kategori top adaydan dolduruldu (${topCategory.name}).`);
  }

  // 3) Düşük skorlu AI seçimi, belirgin daha iyi aday varsa override.
  if (
    topBrand &&
    out.suggestedBrandId != null &&
    selectedBrandScore > 0 &&
    selectedBrandScore < 45 &&
    topBrand.score - selectedBrandScore >= 22 &&
    topBrand.score >= 70
  ) {
    out.suggestedBrandId = topBrand.brandId;
    out.suggestedBrandName = topBrand.name;
    notes.push(
      `Marka AI seçimi düşük skorlu olduğu için top adayla değiştirildi (${topBrand.name}).`
    );
  }

  if (
    topCategory &&
    out.suggestedCategoryId != null &&
    selectedCategoryScore > 0 &&
    selectedCategoryScore < 45 &&
    topCategory.score - selectedCategoryScore >= 22 &&
    topCategory.score >= 70
  ) {
    out.suggestedCategoryId = topCategory.categoryId;
    out.suggestedCategoryName = topCategory.name;
    notes.push(
      `Kategori AI seçimi düşük skorlu olduğu için top adayla değiştirildi (${topCategory.name}).`
    );
  }

  // 4) Confidence yeniden kalibrasyon
  const brandScore = findBrandScore(out.suggestedBrandId, input.brandCandidates);
  const categoryScore = findCategoryScore(
    out.suggestedCategoryId,
    input.categoryCandidates
  );
  const candidateSupport = clampInt(
    Math.round(brandScore * 0.4 + categoryScore * 0.6),
    0,
    100
  );

  const brandOverlap =
    out.suggestedBrandName && input.normalizedBrand
      ? tokenOverlapRatio(out.suggestedBrandName, input.normalizedBrand)
      : 0;
  const categoryOverlap =
    out.suggestedCategoryName &&
    (input.normalizedCategoryText || input.normalizedName)
      ? tokenOverlapRatio(
          out.suggestedCategoryName,
          input.normalizedCategoryText || input.normalizedName || ""
        )
      : 0;
  const overlapSupport = clampInt(
    Math.round((brandOverlap * 0.35 + categoryOverlap * 0.65) * 100),
    0,
    100
  );

  const blended = clampInt(
    Math.round(out.confidenceScore * 0.55 + candidateSupport * 0.3 + overlapSupport * 0.15),
    0,
    100
  );
  out.confidenceScore = blended;

  if (notes.length > 0) {
    const suffix = ` [PostProcess: ${notes.join(" ")}]`;
    out.aiReasoningSummary = `${out.aiReasoningSummary}${suffix}`.slice(0, 4000);
  }

  return out;
}

