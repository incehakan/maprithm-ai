import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { normalizeFieldKey } from "@/lib/importFlexibleFieldMap";

const MODEL = "gpt-4.1-mini";
const MAX_VALUES_PER_ATTRIBUTE = 120;

export type CategoryAttributeDef = {
  attributeId: number;
  attributeName: string;
  isRequired: boolean;
  isVariantable: boolean;
  allowCustom: boolean;
  values: Array<{ attributeValueId: number; attributeValue: string }>;
};

export type AttributeSuggestionAiInput = {
  normalizedName: string | null;
  normalizedDescription: string | null;
  /**
   * XML/JSON ham alanlarından (attributes_attribute, varyant ölçü vb.) çıkarılan ek metin.
   * AI ve deterministik ölçü eşlemesi için kullanılır; name/description ile birleşmez (ayrı kaynak).
   */
  extraDimensionText?: string | null;
  suggestedCategoryId: number;
  suggestedCategoryName: string | null;
  attributes: CategoryAttributeDef[];
};

export type DeterministicAttributeSuggestion = {
  attributeId: number;
  attributeName: string;
  attributeValueId: number | null;
  attributeValue: string | null;
  customValue: string | null;
  isRequired: boolean;
  reason: string;
};

/** AI JSON satırı (yanıt + API) */
export type AttributeAiItemOutput = {
  attributeId: number;
  attributeName: string;
  attributeValueId: number | null;
  attributeValue: string | null;
  customValue: string | null;
  confidenceScore: number;
  isRequired: boolean;
};

export type AttributeSuggestionPersistRow = {
  attributeId: number;
  attributeName: string;
  attributeValueId: number | null;
  attributeValue: string | null;
  customValue: string | null;
  isRequired: boolean;
};

export type MissingRequiredAttributeItem = {
  attributeId: number;
  attributeName: string;
  isRequired: true;
  reason: string;
};

export type LoadCategoryAttributeDefsOptions = {
  /**
   * true: tüm önceden tanımlı değerleri yükle (kayıt doğrulama / UI ile uyum).
   * false/verilmez: AI prompt boyutu için özellik başına en fazla MAX_VALUES_PER_ATTRIBUTE.
   */
  allValues?: boolean;
};

/**
 * Veritabanından kategori özelliklerini ve değerlerini yükler.
 */
export async function loadCategoryAttributeDefs(
  categoryId: number,
  options?: LoadCategoryAttributeDefsOptions
): Promise<CategoryAttributeDef[]> {
  const allValues = Boolean(options?.allValues);
  const rows = await prisma.marketplaceAttribute.findMany({
    where: { platform: "TRENDYOL", categoryId: categoryId.toString() },
    include: {
      values: allValues
        ? { orderBy: { name: "asc" } }
        : {
            orderBy: { name: "asc" },
            take: MAX_VALUES_PER_ATTRIBUTE
          }
    },
    orderBy: [{ required: "desc" }, { name: "asc" }]
  });

  return rows.map((r: any) => {
    const meta = r.metadata && typeof r.metadata === "object" ? (r.metadata as any) : {};
    return {
      attributeId: parseInt(r.externalId, 10),
      attributeName: r.name,
      isRequired: r.required,
      isVariantable: meta.isVariantable || false,
      allowCustom: meta.allowCustom || false,
      values: r.values.map((v: any) => ({
        attributeValueId: parseInt(v.externalId, 10),
        attributeValue: v.name
      }))
    };
  });
}

/**
 * AI: ilk N değer; deterministik: ölçü benzeri özelliklerde tam liste (yanlış valueId riskini azaltır).
 */
export async function loadCategoryAttributeDefsAiAndDeterministic(
  categoryId: number
): Promise<{
  forAi: CategoryAttributeDef[];
  forDeterministic: CategoryAttributeDef[];
}> {
  const [capped, full] = await Promise.all([
    loadCategoryAttributeDefs(categoryId),
    loadCategoryAttributeDefs(categoryId, { allValues: true })
  ]);
  const forDeterministic = capped.map((d) => {
    if (!isSizeLikeTrendyolAttributeName(d.attributeName)) return d;
    const f = full.find((x) => x.attributeId === d.attributeId);
    return f ? { ...d, values: f.values } : d;
  });
  return { forAi: capped, forDeterministic };
}

/** Trendyol attribute adı ölçü / ebat / tablo ölçüsü gibi bir alan mı? */
export function isSizeLikeTrendyolAttributeName(name: string): boolean {
  const n = name.toLowerCase();
  return /(boyut|ebat|ölçü|olcu|en x boy|enxboy|dimension|size|tablo)/.test(n);
}

/**
 * Import satırı rawData içinden ölçüyle ilgili alanları toplar (attributes_attribute vb.).
 */
export function extractExtraDimensionTextFromRawData(
  rawData: unknown
): string | null {
  if (rawData == null || typeof rawData !== "object") return null;
  const o = rawData as Record<string, unknown>;
  const parts: string[] = [];
  const seen = new Set<string>();

  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue;
    const nk = normalizeFieldKey(k);
    if (nk.length < 2) continue;
    const kl = nk.toLowerCase();
    const looksDimension =
      /(attribute|olcu|olçü|ebat|boyut|measure|size|dimension|varyant|tablo)/.test(
        kl
      );
    if (!looksDimension) continue;

    const s = String(v).trim();
    if (!s || s.length > 2000) continue;
    const dedup = `${nk}:${s}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    parts.push(s);
  }

  return parts.length ? parts.join("\n") : null;
}

export function buildAttributeSuggestionUserPrompt(
  input: AttributeSuggestionAiInput
): string {
  const attrsPayload = input.attributes.map((a) => ({
    attributeId: a.attributeId,
    attributeName: a.attributeName,
    isRequired: a.isRequired,
    isVariantable: a.isVariantable,
    allowCustom: a.allowCustom,
    predefinedValues:
      a.values.length > 0
        ? a.values.map((v) => ({
            attributeValueId: v.attributeValueId,
            attributeValue: v.attributeValue
          }))
        : [],
    note:
      a.values.length >= MAX_VALUES_PER_ATTRIBUTE
        ? `İlk ${MAX_VALUES_PER_ATTRIBUTE} değer listelendi.`
        : undefined
  }));

  const extra = input.extraDimensionText?.trim();

  return `Trendyol yaprak kategorisindeki ürün özellikleri için değer öner.

## Ürün
- normalizedName: ${JSON.stringify(input.normalizedName ?? "")}
- normalizedDescription: ${JSON.stringify(input.normalizedDescription ?? "")}
${extra ? `- extraDimensionText (ham XML/JSON alanlarından ölçü ipuçları): ${JSON.stringify(extra)}` : ""}

## Seçilen kategori
- categoryId: ${input.suggestedCategoryId}
- categoryName: ${JSON.stringify(input.suggestedCategoryName ?? "")}

## Kategori özellikleri (sıra: önce zorunlular)
${JSON.stringify(attrsPayload, null, 2)}

## Kurallar
1. Zorunlu (isRequired: true) özellikleri önce doldur; mümkün olduğunca yüksek confidenceScore ver.
2. predefinedValues doluysa: mutlaka listedeki bir attributeValueId seç; metni attributeValue ile aynı olmalı (listeden kopyala).
3. predefinedValues boş ve allowCustom true ise: attributeValueId null, customValue ile serbest metin ver.
4. predefinedValues boş ve allowCustom false ise: bu özellik için makul bir öneri veremiyorsan o özelliği diziye EKLEME (sistem eksik olarak işaretler).
5. Listede olmayan attributeId veya attributeValueId UYDURMA.
6. Her dizi elemanı: attributeId, attributeName, attributeValueId (number|null), attributeValue (string|null), customValue (string|null), confidenceScore (0-100 tam sayı).

## Çıktı
Yalnızca tek bir JSON DİZİSİ döndür — başka metin yok. Örnek:
[
  {
    "attributeId": 123,
    "attributeName": "Renk",
    "attributeValueId": 456,
    "attributeValue": "Beyaz",
    "customValue": null,
    "confidenceScore": 88
  }
]`;
}

const ATTR_SYSTEM = `Sen Trendyol kategori özellik eşleştirmesinde uzman bir asistanısın.
Yalnızca verilen attributeId ve attributeValueId değerlerini kullanırsın; yeni id icat etmezsin.
Yanıtın yalnızca istenen şemada bir JSON dizisi olmalıdır.`;

export function extractJsonArrayFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const inner = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = inner.indexOf("[");
  const end = inner.lastIndexOf("]");
  if (start < 0 || end <= start) {
    throw new Error("JSON dizisi bulunamadı.");
  }
  return JSON.parse(inner.slice(start, end + 1));
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.min(max, Math.max(min, n)));
}

function asNullableString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asNullableNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * AI çıktısını doğrular; DB satırları ve eksik zorunlu listesi üretir.
 */
export function validateAndBuildAttributeSuggestions(
  raw: unknown,
  defs: CategoryAttributeDef[]
): {
  persistRows: AttributeSuggestionPersistRow[];
  aiItems: AttributeAiItemOutput[];
  missingRequired: MissingRequiredAttributeItem[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const defMap = new Map(defs.map((d) => [d.attributeId, d]));
  const satisfiedRequired = new Set<number>();

  const persistRows: AttributeSuggestionPersistRow[] = [];
  const aiItems: AttributeAiItemOutput[] = [];
  const seenAttr = new Set<number>();

  if (!Array.isArray(raw)) {
    warnings.push("Model çıktısı dizi değil.");
    return {
      persistRows: [],
      aiItems: [],
      missingRequired: collectAllRequiredMissing(
        defs,
        "Model geçerli JSON dizi döndürmedi."
      ),
      warnings
    };
  }

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const attributeId = asNullableNumber(o.attributeId);
    if (attributeId == null) {
      warnings.push("Geçersiz attributeId atlandı.");
      continue;
    }

    const def = defMap.get(attributeId);
    if (!def) {
      warnings.push(`Bilinmeyen attributeId: ${attributeId}`);
      continue;
    }

    if (seenAttr.has(attributeId)) {
      warnings.push(`Yinelenen attributeId model çıktısında: ${attributeId}`);
      continue;
    }

    const confidenceScore = clampInt(
      typeof o.confidenceScore === "number"
        ? o.confidenceScore
        : parseFloat(String(o.confidenceScore ?? 0)),
      0,
      100
    );

    const valueById = new Map(
      def.values.map((v) => [v.attributeValueId, v.attributeValue])
    );

    let attributeValueId = asNullableNumber(o.attributeValueId);
    let attributeValue = asNullableString(o.attributeValue);
    const customValue = asNullableString(o.customValue);

    if (def.values.length > 0) {
      if (attributeValueId != null && valueById.has(attributeValueId)) {
        attributeValue = valueById.get(attributeValueId)!;
        persistRows.push({
          attributeId: def.attributeId,
          attributeName: def.attributeName,
          attributeValueId,
          attributeValue,
          customValue: null,
          isRequired: def.isRequired
        });
        aiItems.push({
          attributeId: def.attributeId,
          attributeName: def.attributeName,
          attributeValueId,
          attributeValue,
          customValue: null,
          confidenceScore,
          isRequired: def.isRequired
        });
        if (def.isRequired) satisfiedRequired.add(def.attributeId);
        seenAttr.add(def.attributeId);
      } else if (def.allowCustom && customValue) {
        persistRows.push({
          attributeId: def.attributeId,
          attributeName: def.attributeName,
          attributeValueId: null,
          attributeValue: null,
          customValue,
          isRequired: def.isRequired
        });
        aiItems.push({
          attributeId: def.attributeId,
          attributeName: def.attributeName,
          attributeValueId: null,
          attributeValue: null,
          customValue,
          confidenceScore,
          isRequired: def.isRequired
        });
        if (def.isRequired) satisfiedRequired.add(def.attributeId);
        seenAttr.add(def.attributeId);
      } else {
        warnings.push(
          `Özellik ${def.attributeName} (${attributeId}): geçersiz valueId veya custom yok.`
        );
      }
    } else {
      if (def.allowCustom && customValue) {
        persistRows.push({
          attributeId: def.attributeId,
          attributeName: def.attributeName,
          attributeValueId: null,
          attributeValue: null,
          customValue,
          isRequired: def.isRequired
        });
        aiItems.push({
          attributeId: def.attributeId,
          attributeName: def.attributeName,
          attributeValueId: null,
          attributeValue: null,
          customValue,
          confidenceScore,
          isRequired: def.isRequired
        });
        if (def.isRequired) satisfiedRequired.add(def.attributeId);
        seenAttr.add(def.attributeId);
      } else {
        warnings.push(
          `Özellik ${def.attributeName}: önceden tanımlı değer yok ve allowCustom kapalı — atlandı.`
        );
      }
    }
  }

  const missingRequired: MissingRequiredAttributeItem[] = [];
  for (const d of defs) {
    if (!d.isRequired) continue;
    if (satisfiedRequired.has(d.attributeId)) continue;
    let reason = "AI geçerli değer önermedi veya doğrulama başarısız.";
    if (d.values.length === 0 && !d.allowCustom) {
      reason =
        "Önceden tanımlı değer listesi yok ve allowCustom=false; manuel seçim gerekli.";
    }
    missingRequired.push({
      attributeId: d.attributeId,
      attributeName: d.attributeName,
      isRequired: true,
      reason
    });
  }

  return { persistRows, aiItems, missingRequired, warnings };
}

function collectAllRequiredMissing(
  defs: CategoryAttributeDef[],
  reason: string
): MissingRequiredAttributeItem[] {
  return defs
    .filter((d) => d.isRequired)
    .map((d) => ({
      attributeId: d.attributeId,
      attributeName: d.attributeName,
      isRequired: true as const,
      reason
    }));
}

export type AttributeAiCallResult =
  | {
      ok: true;
      persistRows: AttributeSuggestionPersistRow[];
      aiItems: AttributeAiItemOutput[];
      missingRequired: MissingRequiredAttributeItem[];
      warnings: string[];
    }
  | { ok: false; error: string };

export async function callOpenAiTrendyolAttributeSuggestions(
  input: AttributeSuggestionAiInput
): Promise<AttributeAiCallResult> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, error: "OPENAI_API_KEY tanımlı değil." };
  }

  if (input.attributes.length === 0) {
    return {
      ok: true,
      persistRows: [],
      aiItems: [],
      missingRequired: [],
      warnings: []
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: ATTR_SYSTEM },
        {
          role: "user",
          content: buildAttributeSuggestionUserPrompt(input)
        }
      ],
      temperature: 0.25,
      max_tokens: 4096
    });

    const content = completion.choices[0]?.message?.content;
    if (!content?.trim()) {
      return { ok: false, error: "Model boş yanıt döndü." };
    }

    const json = extractJsonArrayFromModelText(content);
    const built = validateAndBuildAttributeSuggestions(json, input.attributes);
    return { ok: true, ...built };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** OpenAI hatasında: özellik satırı yok, tüm zorunlular eksik listesine */
export function buildAttributeFallbackMissing(
  defs: CategoryAttributeDef[],
  reason: string
): {
  persistRows: AttributeSuggestionPersistRow[];
  aiItems: AttributeAiItemOutput[];
  missingRequired: MissingRequiredAttributeItem[];
  warnings: string[];
} {
  return {
    persistRows: [],
    aiItems: [],
    missingRequired: collectAllRequiredMissing(defs, reason),
    warnings: [`Özellik AI fallback: ${reason}`]
  };
}

function normalizeDimensionNumber(n: string): string {
  const trimmed = n.trim().replace(",", ".");
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return trimmed;
  // 60.0 => 60, 60.5 => 60.5
  return Number.isInteger(num) ? String(num) : String(num).replace(/\.0+$/, "");
}

type ProductDimensionPair = {
  a: string;
  b: string;
  source: "name" | "description" | "raw";
};

function extractDimensionPairs(text: string): Array<{ a: string; b: string }> {
  const out: Array<{ a: string; b: string }> = [];
  const re = /(\d+(?:[.,]\d+)?)\s*(?:x|X|×|\*)\s*(\d+(?:[.,]\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    const a = normalizeDimensionNumber(m[1]);
    const b = normalizeDimensionNumber(m[2]);
    if (!a || !b) continue;
    out.push({ a, b });
  }
  return out;
}

function extractProductDimensionPairs(
  name: string | null,
  description: string | null,
  extra: string | null | undefined
): ProductDimensionPair[] {
  const out: ProductDimensionPair[] = [];
  const seen = new Set<string>();
  for (const p of extractDimensionPairs(name ?? "")) {
    const key = `${p.a}x${p.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...p, source: "name" });
  }
  for (const p of extractDimensionPairs(description ?? "")) {
    const key = `${p.a}x${p.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...p, source: "description" });
  }
  for (const p of extractDimensionPairs(extra ?? "")) {
    const key = `${p.a}x${p.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...p, source: "raw" });
  }
  return out;
}

function dimensionSourceBonus(source: ProductDimensionPair["source"]): number {
  if (source === "name") return 100;
  if (source === "description") return 50;
  return 25;
}

function dimensionSourceLabel(source: ProductDimensionPair["source"]): string {
  if (source === "name") return "adındaki";
  if (source === "description") return "açıklamadaki";
  return "ham alandaki";
}

function pairEquals(
  x: { a: string; b: string },
  y: { a: string; b: string },
  allowReverse: boolean
): boolean {
  if (x.a === y.a && x.b === y.b) return true;
  if (!allowReverse) return false;
  return x.a === y.b && x.b === y.a;
}

/**
 * Deterministik kural: ürün ad/açıklamasındaki 60x120 gibi ölçüyü,
 * Boyut/Ebat tipi attribute değerleriyle bire bir eşleştirir.
 */
export function buildDeterministicAttributeSuggestions(
  input: AttributeSuggestionAiInput
): DeterministicAttributeSuggestion[] {
  const productPairs = extractProductDimensionPairs(
    input.normalizedName,
    input.normalizedDescription,
    input.extraDimensionText
  );
  if (productPairs.length === 0) return [];

  const results: DeterministicAttributeSuggestion[] = [];

  for (const def of input.attributes) {
    if (!isSizeLikeTrendyolAttributeName(def.attributeName)) continue;
    if (!def.values.length) continue;

    let matched:
      | { attributeValueId: number; attributeValue: string; reason: string; score: number }
      | null = null;
    for (const pv of productPairs) {
      for (const v of def.values) {
        const valuePairs = extractDimensionPairs(v.attributeValue);
        if (valuePairs.length === 0) continue;
        const direct = valuePairs.some((vp) => pairEquals(vp, pv, false));
        const reverse = !direct && valuePairs.some((vp) => pairEquals(vp, pv, true));
        if (!direct && !reverse) continue;
        const sourceBonus = dimensionSourceBonus(pv.source);
        const score = sourceBonus + (direct ? 10 : 0);
        if (!matched || score > matched.score) {
          matched = {
            attributeValueId: v.attributeValueId,
            attributeValue: v.attributeValue,
            score,
            reason: direct
              ? `Ürün ${dimensionSourceLabel(pv.source)} ölçü (${pv.a}x${pv.b}) ile bire bir eşleşti.`
              : `Ürün ${dimensionSourceLabel(pv.source)} ölçü (${pv.a}x${pv.b}) ters sıra ile eşleşti.`
          };
        }
      }
    }

    if (matched) {
      results.push({
        attributeId: def.attributeId,
        attributeName: def.attributeName,
        attributeValueId: matched.attributeValueId,
        attributeValue: matched.attributeValue,
        customValue: null,
        isRequired: def.isRequired,
        reason: matched.reason
      });
    } else if (def.allowCustom && productPairs.length > 0) {
      // Bazı kategorilerde predefined value listesi çok uzun olduğundan
      // eşleşecek value prompt setine girmeyebilir. Bu durumda ham ürün
      // ölçüsünü customValue olarak taşıyarak yanlış valueId seçimlerini azaltırız.
      const p = productPairs[0];
      results.push({
        attributeId: def.attributeId,
        attributeName: def.attributeName,
        attributeValueId: null,
        attributeValue: null,
        customValue: `${p.a} x ${p.b}`,
        isRequired: def.isRequired,
        reason:
          `Predefined listede eşleşme yok; ürün ${dimensionSourceLabel(p.source)} ölçü customValue olarak yazıldı.`
      });
    }
  }

  return results;
}
