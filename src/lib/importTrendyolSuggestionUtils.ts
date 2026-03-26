import type {
  CategoryAttributeDef,
  MissingRequiredAttributeItem
} from "./importTrendyolAttributeSuggestionAi";

/** missingRequiredAttributes JSON icinden eksik zorunlu ozellik sayisi */

export function countMissingRequiredAttributes(
  missingRequiredAttributes: unknown
): number {
  if (
    missingRequiredAttributes == null ||
    typeof missingRequiredAttributes !== "object"
  ) {
    return 0;
  }
  const m = (missingRequiredAttributes as Record<string, unknown>)
    .missingRequired;
  return Array.isArray(m) ? m.length : 0;
}

export type ConfidenceBand = "high" | "medium" | "low";

export function confidenceBand(score: number | null | undefined): ConfidenceBand {
  const s = score ?? 0;
  if (s >= 70) return "high";
  if (s >= 40) return "medium";
  return "low";
}

export type SuggestionAttributeInput = {
  attributeId: number;
  attributeValueId: number | null;
  customValue: string | null;
};

/**
 * Kategori tanımları + form değerlerinden eksik zorunlular listesini üretir
 * (ImportRowMarketplaceSuggestion.missingRequiredAttributes JSON şekli).
 */
export function buildMissingRequiredAttributesJson(
  defs: CategoryAttributeDef[],
  attributes: SuggestionAttributeInput[]
): { missingRequired: MissingRequiredAttributeItem[] } {
  const map = new Map(attributes.map((a) => [a.attributeId, a]));
  const missing: MissingRequiredAttributeItem[] = [];

  for (const d of defs) {
    if (!d.isRequired) continue;
    const row = map.get(d.attributeId);
    const vidOk =
      row != null &&
      row.attributeValueId != null &&
      Number.isFinite(row.attributeValueId);
    const customOk =
      row != null &&
      row.customValue != null &&
      String(row.customValue).trim() !== "";
    if (vidOk || customOk) continue;

    const reason =
      d.values.length === 0 && !d.allowCustom
        ? "Önceden tanımlı değer yok ve özel metin kabul edilmiyor; kategori özellik senkronu gerekli."
        : "Değer seçilmedi veya özel metin girilmedi.";

    missing.push({
      attributeId: d.attributeId,
      attributeName: d.attributeName,
      isRequired: true,
      reason
    });
  }

  return { missingRequired: missing };
}

export function parseMissingRequiredList(
  missingRequiredAttributes: unknown
): MissingRequiredAttributeItem[] {
  if (
    missingRequiredAttributes == null ||
    typeof missingRequiredAttributes !== "object"
  ) {
    return [];
  }
  const m = (missingRequiredAttributes as Record<string, unknown>)
    .missingRequired;
  return Array.isArray(m) ? (m as MissingRequiredAttributeItem[]) : [];
}
