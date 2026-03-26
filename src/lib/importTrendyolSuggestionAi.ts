import { openai } from "@/lib/openai";

/** OpenAI'ya giden satır + adaylar */
export type TrendyolSuggestionAiInput = {
  normalizedName: string | null;
  normalizedDescription: string | null;
  normalizedBrand: string | null;
  normalizedCategoryText: string | null;
  price: number | null;
  stock: number | null;
  brandCandidates: Array<{ brandId: number; name: string }>;
  categoryCandidates: Array<{
    categoryId: number;
    name: string;
    isLeaf: boolean;
  }>;
};

/** Beklenen model JSON çıktısı (0–100 güven) */
export type TrendyolSuggestionAiParsed = {
  suggestedBrandId: number | null;
  suggestedBrandName: string | null;
  suggestedCategoryId: number | null;
  suggestedCategoryName: string | null;
  confidenceScore: number;
  aiReasoningSummary: string;
};

const MODEL = "gpt-4.1-mini";

export function buildTrendyolSuggestionUserPrompt(input: TrendyolSuggestionAiInput): string {
  const brandsJson = JSON.stringify(
    input.brandCandidates.map((b) => ({
      brandId: b.brandId,
      name: b.name
    })),
    null,
    2
  );
  const catsJson = JSON.stringify(
    input.categoryCandidates.map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      isLeaf: c.isLeaf
    })),
    null,
    2
  );

  return `Aşağıdaki içe aktarılmış ürün satırı için Trendyol pazaryerinde kullanılacak marka ve YAPRAK kategori seçimi yap.

## Ürün alanları
- normalizedName: ${JSON.stringify(input.normalizedName ?? "")}
- normalizedDescription: ${JSON.stringify(input.normalizedDescription ?? "")}
- normalizedBrand: ${JSON.stringify(input.normalizedBrand ?? "")}
- normalizedCategoryText: ${JSON.stringify(input.normalizedCategoryText ?? "")}
- price: ${input.price ?? "null"}
- stock: ${input.stock ?? "null"}

## İzin verilen marka adayları (SADECE bu listeden seç)
${brandsJson.length > 2 ? brandsJson : "[] (boş — marka seçme, suggestedBrandId ve suggestedBrandName null olsun)"}

## İzin verilen kategori adayları (SADECE bu listeden seç — hepsi yaprak kategori)
${catsJson.length > 2 ? catsJson : "[] (boş — kategori seçme, suggestedCategoryId ve suggestedCategoryName null olsun)"}

## Kurallar
1. suggestedBrandId / suggestedBrandName: SADECE marka adayları listesindeki bir çifti seç. Liste boşsa ikisi de null.
2. suggestedCategoryId / suggestedCategoryName: SADECE kategori adayları listesindeki bir çifti seç. Liste boşsa ikisi de null.
3. Listede olmayan id veya isim UYDURMA; yeni kategori/marka icat etme.
4. confidenceScore: 0 ile 100 arası tam sayı; emin değilsen düşük ver.
5. aiReasoningSummary: Türkçe, kısa (1-3 cümle), neden bu adayları seçtiğini açıkla.

## Çıktı
Yalnızca geçerli bir JSON nesnesi döndür (markdown veya açıklama yok). Şema:
{
  "suggestedBrandId": number | null,
  "suggestedBrandName": string | null,
  "suggestedCategoryId": number | null,
  "suggestedCategoryName": string | null,
  "confidenceScore": number,
  "aiReasoningSummary": string
}`;
}

const SYSTEM_PROMPT = `Sen Trendyol pazaryeri ürün eşleştirmesinde uzman bir asistanısın.
Verilen aday listelerinin DIŞINA asla çıkmazsın; serbest metinle yeni marka veya kategori id'si üretmezsin.
Cevabın yalnızca istenen alanlara sahip tek bir JSON nesnesi olmalıdır.`;

/**
 * Model yanıtından güvenli JSON nesnesi çıkarır.
 */
export function extractJsonObjectFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const inner = fenceMatch ? fenceMatch[1].trim() : trimmed;
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("JSON nesnesi bulunamadı.");
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
 * Ham parse sonrası alanları normalize eder ve aday listelerine göre doğrular.
 * Geçersiz id seçildiyse null'a çeker.
 */
export function validateAndNormalizeAiSuggestion(
  raw: unknown,
  brandCandidates: TrendyolSuggestionAiInput["brandCandidates"],
  categoryCandidates: TrendyolSuggestionAiInput["categoryCandidates"]
): TrendyolSuggestionAiParsed {
  const o =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  let suggestedBrandId = asNullableNumber(o.suggestedBrandId);
  let suggestedBrandName = asNullableString(o.suggestedBrandName);
  let suggestedCategoryId = asNullableNumber(o.suggestedCategoryId);
  let suggestedCategoryName = asNullableString(o.suggestedCategoryName);
  const confidenceScore = clampInt(
    typeof o.confidenceScore === "number"
      ? o.confidenceScore
      : parseFloat(String(o.confidenceScore ?? 0)),
    0,
    100
  );
  let aiReasoningSummary =
    asNullableString(o.aiReasoningSummary) ??
    "Model gerekçe döndürmedi.";

  const brandSet = new Map(brandCandidates.map((b) => [b.brandId, b.name]));
  if (brandCandidates.length === 0) {
    suggestedBrandId = null;
    suggestedBrandName = null;
  } else if (suggestedBrandId != null && brandSet.has(suggestedBrandId)) {
    suggestedBrandName = brandSet.get(suggestedBrandId)!;
  } else {
    if (suggestedBrandId != null) {
      aiReasoningSummary +=
        " [Doğrulama: marka id aday listesinde yok, seçim iptal.]";
    }
    suggestedBrandId = null;
    suggestedBrandName = null;
  }

  const catSet = new Map(
    categoryCandidates.map((c) => [c.categoryId, c.name])
  );
  if (categoryCandidates.length === 0) {
    suggestedCategoryId = null;
    suggestedCategoryName = null;
  } else if (
    suggestedCategoryId != null &&
    catSet.has(suggestedCategoryId)
  ) {
    suggestedCategoryName = catSet.get(suggestedCategoryId)!;
  } else {
    if (suggestedCategoryId != null) {
      aiReasoningSummary +=
        " [Doğrulama: kategori id aday listesinde yok, seçim iptal.]";
    }
    suggestedCategoryId = null;
    suggestedCategoryName = null;
  }

  return {
    suggestedBrandId,
    suggestedBrandName,
    suggestedCategoryId,
    suggestedCategoryName,
    confidenceScore,
    aiReasoningSummary: aiReasoningSummary.slice(0, 4000)
  };
}

export type AiCallResult =
  | { ok: true; data: TrendyolSuggestionAiParsed }
  | { ok: false; error: string };

/**
 * OpenAI çağrısı; API key yoksa veya hata olursa ok: false.
 */
export async function callOpenAiTrendyolSuggestion(
  input: TrendyolSuggestionAiInput
): Promise<AiCallResult> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, error: "OPENAI_API_KEY tanımlı değil." };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildTrendyolSuggestionUserPrompt(input)
        }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const content = completion.choices[0]?.message?.content;
    if (!content?.trim()) {
      return { ok: false, error: "Model boş yanıt döndü." };
    }

    const json = extractJsonObjectFromModelText(content);
    const validated = validateAndNormalizeAiSuggestion(
      json,
      input.brandCandidates,
      input.categoryCandidates
    );
    return { ok: true, data: validated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
