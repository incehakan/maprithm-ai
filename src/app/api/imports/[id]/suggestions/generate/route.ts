import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  trendyolBrandListableWhere,
  trendyolCategoryListableWhere
} from "@/lib/trendyolListable";
import {
  extractBasicProductSignals,
  findBrandCandidates,
  mergeCategoryCandidates,
  scoreToUnit,
  type BasicProductSignals,
  type ScoredBrandCandidate,
  type ScoredCategoryCandidate
} from "@/lib/trendyolRuleBasedPreMatch";
import {
  callOpenAiTrendyolSuggestion,
  type TrendyolSuggestionAiParsed
} from "@/lib/importTrendyolSuggestionAi";
import { buildTrendyolDbFallbackSuggestion } from "@/lib/trendyolFallbackMatch";
import { postProcessTrendyolSuggestion } from "@/lib/importTrendyolSuggestionPostProcess";
import {
  buildDeterministicAttributeSuggestions,
  buildAttributeFallbackMissing,
  callOpenAiTrendyolAttributeSuggestions,
  loadCategoryAttributeDefsAiAndDeterministic,
  extractExtraDimensionTextFromRawData,
  type AttributeAiItemOutput,
  type AttributeSuggestionPersistRow,
  type MissingRequiredAttributeItem
} from "@/lib/importTrendyolAttributeSuggestionAi";
import { isImportUsable } from "@/lib/importStatus";

type Params = { params: { id: string } };

/** Uzun işlem (Vercel vb.); yerelde de zararı yok */
export const maxDuration = 300;

type GenerateBody = {
  importRowIds?: string[];
  regenerate?: boolean;
  /** Sayfalı işlem: büyük dosyalarda zorunlu (her partide max ~2× limit OpenAI çağrısı) */
  offset?: number;
  /** Tanımlıysa yalnızca bu kadar satır işlenir (1–80) */
  limit?: number;
};

export type RowRuleMatchResult = {
  importRowId: string;
  rowIndex: number;
  extractedSignals: BasicProductSignals;
  brandCandidates: Array<{
    brandId: number;
    name: string;
    score: number;
    scoreUnit: number;
  }>;
  categoryCandidates: Array<{
    categoryId: number;
    name: string;
    isLeaf: boolean;
    score: number;
    scoreUnit: number;
  }>;
  ai: {
    usedFallback: boolean;
    error?: string;
    suggestion: TrendyolSuggestionAiParsed;
  };
  attributeSuggestions: {
    skipped?: boolean;
    reason?: string;
    definitionCount?: number;
    usedFallback?: boolean;
    error?: string;
    persistedCount: number;
    missingRequiredCount: number;
    items?: AttributeAiItemOutput[];
    missingRequired?: MissingRequiredAttributeItem[];
    warnings?: string[];
  };
};

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

const PLATFORM = "trendyol";

function mapBrandCandidates(c: ScoredBrandCandidate[]) {
  return c.map((x) => ({
    brandId: x.brandId,
    name: x.name,
    score: x.score,
    scoreUnit: scoreToUnit(x.score)
  }));
}

function mapCategoryCandidates(c: ScoredCategoryCandidate[]) {
  return c.map((x) => ({
    categoryId: x.categoryId,
    name: x.name,
    isLeaf: x.isLeaf,
    score: x.score,
    scoreUnit: scoreToUnit(x.score)
  }));
}

/**
 * POST /api/imports/[id]/suggestions/generate
 * 1) Kural tabanlı adaylar
 * 2) OpenAI ile adaylar içinden seçim (0–100 güven)
 * 3) Hata / kota / key yok → kural tabanlı ilk aday, düşük güven
 */
export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  const userId = getUserIdFromSession(session);
  if (!userId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const job = await prisma.importJob.findFirst({
    where: { id: params.id, userId }
  });

  if (!job) {
    return NextResponse.json({ error: "İçe aktarma bulunamadı." }, { status: 404 });
  }
  if (!isImportUsable(job)) {
    return NextResponse.json(
      { error: "Pasif import verisi için AI önerisi üretilemez." },
      { status: 400 }
    );
  }

  let body: GenerateBody = {};
  try {
    const text = await request.text();
    if (text?.trim()) body = JSON.parse(text) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const regenerate = Boolean(body.regenerate);
  const filterIds =
    Array.isArray(body.importRowIds) && body.importRowIds.length > 0
      ? body.importRowIds.filter((x) => typeof x === "string" && x.length > 0)
      : null;

  const useBatch =
    typeof body.limit === "number" &&
    Number.isFinite(body.limit) &&
    body.limit > 0;
  const batchLimit = useBatch
    ? Math.min(Math.max(Math.floor(body.limit as number), 1), 80)
    : undefined;
  const batchOffset = useBatch
    ? Math.max(0, Math.floor(Number(body.offset) || 0))
    : undefined;

  const rowWhere = {
    importJobId: params.id,
    ...(filterIds ? { id: { in: filterIds } } : {})
  };

  const totalRowsInJob = await prisma.importRow.count({
    where: rowWhere
  });

  const categoryAttributeDefsCache = new Map<
    number,
    Awaited<ReturnType<typeof loadCategoryAttributeDefsAiAndDeterministic>>
  >();

  async function getCategoryAttributeDefsPair(categoryId: number) {
    let cached = categoryAttributeDefsCache.get(categoryId);
    if (!cached) {
      cached = await loadCategoryAttributeDefsAiAndDeterministic(categoryId);
      categoryAttributeDefsCache.set(categoryId, cached);
    }
    return cached;
  }

  const importRows = await prisma.importRow.findMany({
    where: rowWhere,
    select: {
      id: true,
      rowIndex: true,
      status: true,
      rawData: true,
      normalizedName: true,
      normalizedDescription: true,
      normalizedBrand: true,
      normalizedCategoryText: true,
      price: true,
      stock: true
    },
    orderBy: { rowIndex: "asc" },
    ...(useBatch && batchLimit != null && batchOffset != null
      ? { skip: batchOffset, take: batchLimit }
      : {})
  });

  if (filterIds) {
    const found = new Set(importRows.map((r) => r.id));
    const missing = filterIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Bazı satır id'leri bu işe ait değil.",
          invalidRowIds: missing
        },
        { status: 400 }
      );
    }
  }

  if (importRows.length === 0) {
    if (useBatch) {
      const nextOff = batchOffset ?? 0;
      const hasMore = totalRowsInJob > 0 && nextOff < totalRowsInJob;
      return NextResponse.json({
        success: true,
        importJobId: params.id,
        created: 0,
        updated: 0,
        skippedFailedRows: 0,
        skippedExistingNoRegenerate: 0,
        aiFallbackCount: 0,
        message: "Bu aralıkta satır yok (offset sona ulaştı).",
        rowResults: [],
        suggestions: [],
        pagination: {
          offset: nextOff,
          limit: batchLimit ?? 0,
          processedInBatch: 0,
          totalRows: totalRowsInJob,
          nextOffset: nextOff,
          hasMore
        }
      });
    }
    return NextResponse.json(
      { error: "İşlenecek import satırı yok." },
      { status: 400 }
    );
  }

  try {
  const [brands, categories] = await Promise.all([
    prisma.trendyolBrand.findMany({
      where: trendyolBrandListableWhere,
      select: { brandId: true, name: true }
    }),
    prisma.trendyolCategory.findMany({
      where: {
        ...trendyolCategoryListableWhere,
        isLeaf: true
      },
      select: { categoryId: true, name: true, isLeaf: true }
    })
  ]);

  const brandRows = brands.map((b) => ({
    brandId: b.brandId,
    name: b.name
  }));
  const categoryRows = categories.map((c) => ({
    categoryId: c.categoryId,
    name: c.name,
    isLeaf: c.isLeaf
  }));

  let created = 0;
  let updated = 0;
  let skippedFailedRows = 0;
  let skippedExistingNoRegenerate = 0;
  let aiFallbackCount = 0;
  const rowResults: RowRuleMatchResult[] = [];

  for (const row of importRows) {
    if (row.status === "failed") {
      skippedFailedRows += 1;
      continue;
    }

    const existing = await prisma.importRowMarketplaceSuggestion.findUnique({
      where: {
        importRowId_platform: {
          importRowId: row.id,
          platform: PLATFORM
        }
      }
    });

    if (existing && !regenerate) {
      skippedExistingNoRegenerate += 1;
      continue;
    }

    if (existing && regenerate) {
      await prisma.importRowMarketplaceSuggestedAttribute.deleteMany({
        where: { suggestionId: existing.id }
      });
    }

    const extractedSignals = extractBasicProductSignals(
      row.normalizedName,
      row.normalizedDescription,
      row.normalizedBrand,
      row.normalizedCategoryText
    );

    const brandCandidates = row.normalizedBrand?.trim()
      ? findBrandCandidates(brandRows, row.normalizedBrand, 5)
      : [];

    const categoryCandidates = mergeCategoryCandidates(
      categoryRows,
      [
        row.normalizedCategoryText,
        row.normalizedName,
        extractedSignals.combinedSearchText,
        extractedSignals.nameNormalized
      ],
      5
    );

    const aiInput = {
      normalizedName: row.normalizedName,
      normalizedDescription: row.normalizedDescription,
      normalizedBrand: row.normalizedBrand,
      normalizedCategoryText: row.normalizedCategoryText,
      price: row.price,
      stock: row.stock,
      brandCandidates: brandCandidates.map((b) => ({
        brandId: b.brandId,
        name: b.name
      })),
      categoryCandidates: categoryCandidates.map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        isLeaf: c.isLeaf
      }))
    };

    const aiResult = await callOpenAiTrendyolSuggestion(aiInput);

    let suggestion: TrendyolSuggestionAiParsed;
    let usedFallback = false;
    let aiError: string | undefined;

    if (aiResult.ok) {
      suggestion = aiResult.data;
    } else {
      usedFallback = true;
      aiFallbackCount += 1;
      aiError = aiResult.error;
      suggestion = await buildTrendyolDbFallbackSuggestion({
        db: prisma,
        openAiReason: aiResult.error,
        normalizedBrand: row.normalizedBrand,
        normalizedCategoryText: row.normalizedCategoryText,
        normalizedName: row.normalizedName
      });
    }

    suggestion = postProcessTrendyolSuggestion({
      suggestion,
      normalizedBrand: row.normalizedBrand,
      normalizedCategoryText: row.normalizedCategoryText,
      normalizedName: row.normalizedName,
      brandCandidates: brandCandidates.map((b) => ({
        brandId: b.brandId,
        name: b.name,
        score: b.score
      })),
      categoryCandidates: categoryCandidates.map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        isLeaf: c.isLeaf,
        score: c.score
      }))
    });

    const suggestionData = {
      status: "suggested" as const,
      suggestedBrandId: suggestion.suggestedBrandId,
      suggestedBrandName: suggestion.suggestedBrandName,
      suggestedCategoryId: suggestion.suggestedCategoryId,
      suggestedCategoryName: suggestion.suggestedCategoryName,
      confidenceScore: suggestion.confidenceScore,
      aiReasoningSummary: suggestion.aiReasoningSummary,
      missingRequiredAttributes: Prisma.DbNull
    };

    // upsert: paralel partiler / çift istekte findUnique boşken create → unique hatası olmasın
    const savedSuggestion = await prisma.importRowMarketplaceSuggestion.upsert({
      where: {
        importRowId_platform: {
          importRowId: row.id,
          platform: PLATFORM
        }
      },
      create: {
        importRowId: row.id,
        platform: PLATFORM,
        ...suggestionData
      },
      update: suggestionData
    });

    if (existing) updated += 1;
    else created += 1;

    await prisma.importRowMarketplaceSuggestedAttribute.deleteMany({
      where: { suggestionId: savedSuggestion.id }
    });

    let attributeSuggestions: RowRuleMatchResult["attributeSuggestions"];

    const catId = suggestion.suggestedCategoryId;
    if (catId == null) {
      attributeSuggestions = {
        skipped: true,
        reason: "Önerilen Trendyol kategori id yok; özellik eşlemesi atlandı.",
        persistedCount: 0,
        missingRequiredCount: 0
      };
    } else {
      const { forAi: attrDefs, forDeterministic: attrDefsDeterministic } =
        await getCategoryAttributeDefsPair(catId);
      if (attrDefs.length === 0) {
        attributeSuggestions = {
          definitionCount: 0,
          persistedCount: 0,
          missingRequiredCount: 0,
          warnings: ["Bu kategori için TrendyolCategoryAttribute kaydı yok."]
        };
      } else {
        const attrInput = {
          normalizedName: row.normalizedName,
          normalizedDescription: row.normalizedDescription,
          extraDimensionText: extractExtraDimensionTextFromRawData(row.rawData),
          suggestedCategoryId: catId,
          suggestedCategoryName: suggestion.suggestedCategoryName,
          attributes: attrDefs
        };

        let persistRows: AttributeSuggestionPersistRow[];
        let aiItems: AttributeAiItemOutput[];
        let missingRequired: MissingRequiredAttributeItem[];
        let attrWarnings: string[];
        let attributeReasonMap: Record<string, string>;
        let attrUsedFallback = false;
        let attrError: string | undefined;

        if (usedFallback) {
          attrUsedFallback = true;
          const fb = buildAttributeFallbackMissing(
            attrDefs,
            "Marka/kategori OpenAI olmadan üretildi; özellik değerleri seçilmedi — zorunlular eksik listesinde."
          );
          persistRows = fb.persistRows;
          aiItems = fb.aiItems;
          missingRequired = fb.missingRequired;
          attrWarnings = fb.warnings;
          attributeReasonMap = {};
        } else {
          const attrRes = await callOpenAiTrendyolAttributeSuggestions(attrInput);

          if (attrRes.ok) {
            persistRows = attrRes.persistRows;
            aiItems = attrRes.aiItems;
            missingRequired = attrRes.missingRequired;
            attrWarnings = attrRes.warnings;
            attributeReasonMap = {};
          } else {
            attrUsedFallback = true;
            attrError = attrRes.error;
            const fb = buildAttributeFallbackMissing(attrDefs, attrRes.error);
            persistRows = fb.persistRows;
            aiItems = fb.aiItems;
            missingRequired = fb.missingRequired;
            attrWarnings = fb.warnings;
            attributeReasonMap = {};
          }
        }

        // Varsayılan neden: model önerisi.
        for (const a of aiItems) {
          attributeReasonMap[String(a.attributeId)] = "AI model önerisi";
        }

        // Deterministik düzeltme: Boyut/Ebat gibi ölçü alanlarında metinden bire bir eşleşme
        // yakalanırsa AI seçimi override edilir.
        const deterministic = buildDeterministicAttributeSuggestions({
          ...attrInput,
          attributes: attrDefsDeterministic
        });
        if (deterministic.length > 0) {
          const detByAttr = new Map(deterministic.map((d) => [d.attributeId, d]));

          const mergedPersist = new Map(
            persistRows.map((r) => [r.attributeId, r] as const)
          );
          for (const d of deterministic) {
            mergedPersist.set(d.attributeId, {
              attributeId: d.attributeId,
              attributeName: d.attributeName,
              attributeValueId: d.attributeValueId,
              attributeValue: d.attributeValue,
              customValue: d.customValue,
              isRequired: d.isRequired
            });
          }
          persistRows = [...mergedPersist.values()];

          const mergedAi = new Map(aiItems.map((r) => [r.attributeId, r] as const));
          for (const d of deterministic) {
            mergedAi.set(d.attributeId, {
              attributeId: d.attributeId,
              attributeName: d.attributeName,
              attributeValueId: d.attributeValueId,
              attributeValue: d.attributeValue,
              customValue: d.customValue,
              confidenceScore: 99,
              isRequired: d.isRequired
            });
          }
          aiItems = [...mergedAi.values()];

          // Eksik zorunlu listesi override edilenlerle güncellensin.
          missingRequired = missingRequired.filter((m) => !detByAttr.has(m.attributeId));
          for (const d of deterministic) {
            attributeReasonMap[String(d.attributeId)] = `Deterministik: ${d.reason}`;
          }
          attrWarnings = [
            ...attrWarnings,
            ...deterministic.map(
              (d) =>
                `Deterministik eşleşme: ${d.attributeName} -> ${d.attributeValue ?? d.customValue ?? "—"} (${d.reason})`
            )
          ];
        }

        if (persistRows.length > 0) {
          await prisma.importRowMarketplaceSuggestedAttribute.createMany({
            data: persistRows.map((r) => ({
              suggestionId: savedSuggestion.id,
              attributeId: r.attributeId,
              attributeName: r.attributeName,
              attributeValueId: r.attributeValueId,
              attributeValue: r.attributeValue,
              customValue: r.customValue,
              isRequired: r.isRequired
            }))
          });
        }

        let summary = savedSuggestion.aiReasoningSummary ?? "";
        if (missingRequired.length > 0) {
          summary += ` Özellik: ${missingRequired.length} zorunlu alan doldurulamadı.`;
        }
        if (attrWarnings.length > 0) {
          summary += ` ${attrWarnings.slice(0, 2).join(" ")}`;
        }
        summary = summary.slice(0, 4000);

        await prisma.importRowMarketplaceSuggestion.update({
          where: { id: savedSuggestion.id },
          data: {
            aiReasoningSummary: summary,
            missingRequiredAttributes:
              missingRequired.length > 0 ||
              attrWarnings.length > 0 ||
              Object.keys(attributeReasonMap).length > 0
                ? ({
                    missingRequired,
                    warnings: attrWarnings.slice(0, 30),
                    attributeReasons: attributeReasonMap
                  } as Prisma.InputJsonValue)
                : Prisma.DbNull
          }
        });

        attributeSuggestions = {
          definitionCount: attrDefs.length,
          usedFallback: attrUsedFallback,
          ...(attrError ? { error: attrError } : {}),
          persistedCount: persistRows.length,
          missingRequiredCount: missingRequired.length,
          items: aiItems,
          missingRequired,
          warnings: attrWarnings
        };
      }
    }

    rowResults.push({
      importRowId: row.id,
      rowIndex: row.rowIndex,
      extractedSignals,
      brandCandidates: mapBrandCandidates(brandCandidates),
      categoryCandidates: mapCategoryCandidates(categoryCandidates),
      ai: {
        usedFallback,
        ...(aiError ? { error: aiError } : {}),
        suggestion
      },
      attributeSuggestions
    });
  }

  let out: unknown[] = [];

  if (!useBatch) {
    const suggestions = await prisma.importRowMarketplaceSuggestion.findMany({
      where: {
        importRow: { importJobId: params.id },
        importRowId: { in: importRows.map((r) => r.id) }
      },
      include: {
        importRow: { select: { rowIndex: true } },
        suggestedAttributes: {
          orderBy: [{ isRequired: "desc" }, { attributeName: "asc" }]
        }
      },
      orderBy: { updatedAt: "desc" }
    });
    out = suggestions.map((s) => {
      const { importRow, ...rest } = s;
      return { ...rest, rowIndex: importRow.rowIndex };
    });
  }

  const nextOffset =
    useBatch && batchOffset != null
      ? batchOffset + importRows.length
      : totalRowsInJob;
  const hasMore =
    useBatch && nextOffset < totalRowsInJob;

  return NextResponse.json({
    success: true,
    importJobId: params.id,
    created,
    updated,
    skippedFailedRows,
    skippedExistingNoRegenerate,
    aiFallbackCount,
    ruleMatchCatalog: {
      brandCount: brandRows.length,
      leafCategoryCount: categoryRows.length
    },
    message:
      created || updated
        ? `Öneriler güncellendi. OpenAI fallback satırı: ${aiFallbackCount}.`
        : "Yeni kayıt oluşturulmadı (mevcut öneriler veya failed satırlar). regenerate:true ile güncelleyebilirsiniz.",
    rowResults: useBatch ? [] : rowResults,
    suggestions: useBatch ? [] : out,
    pagination: useBatch
      ? {
          offset: batchOffset ?? 0,
          limit: batchLimit ?? 0,
          processedInBatch: importRows.length,
          totalRows: totalRowsInJob,
          nextOffset,
          hasMore
        }
      : undefined
  });
  } catch (e) {
    console.error("[POST /api/imports/.../suggestions/generate]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error:
          "Trendyol AI önerileri oluşturulurken sunucuda beklenmeyen bir hata oluştu.",
        detail
      },
      { status: 500 }
    );
  }
}
