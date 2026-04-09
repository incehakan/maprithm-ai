import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { loadCategoryAttributeDefs } from "@/lib/importTrendyolAttributeSuggestionAi";
import type { CategoryAttributeDef } from "@/lib/importTrendyolAttributeSuggestionAi";
import {
  buildMissingRequiredAttributesJson,
  confidenceBand,
  countMissingRequiredAttributes,
  parseMissingRequiredList,
  type SuggestionAttributeInput
} from "@/lib/importTrendyolSuggestionUtils";
import {
  trendyolBrandListableWhere,
  trendyolCategoryListableWhere
} from "@/lib/trendyolListable";
import { isImportUsable } from "@/lib/importStatus";

type Params = { params: { id: string; suggestionId: string } };

type CategoryAttrWithValues = Prisma.TrendyolCategoryAttributeGetPayload<{
  include: { values: true };
}>[];

function serializeCategoryAttributes(attrs: CategoryAttrWithValues) {
  return attrs.map((attr) => ({
    id: attr.id,
    categoryId: attr.categoryId,
    attributeId: attr.attributeId,
    attributeName: attr.attributeName,
    isRequired: attr.isRequired,
    isVariantable: attr.isVariantable,
    allowCustom: attr.allowCustom,
    values: attr.values.map((v) => ({
      attributeValueId: v.attributeValueId,
      attributeValue: v.attributeValue
    }))
  }));
}

/**
 * GET — Tek öneri + import satırı + marka/kategori listeleri + kategori özellikleri.
 * Query: previewCategoryId — kayıtlı kategori yerine bu id için TrendyolCategoryAttribute yükler.
 */
export async function GET(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const job = await prisma.importJob.findFirst({
    where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
  });
  if (!job) {
    return NextResponse.json({ error: "İçe aktarma bulunamadı." }, { status: 404 });
  }
  if (!isImportUsable(job)) {
    return NextResponse.json(
      { error: "Pasif import verisi üzerinde Trendyol suggestion işlemi yapılamaz." },
      { status: 400 }
    );
  }

  const suggestion = await prisma.importRowMarketplaceSuggestion.findFirst({
    where: {
      id: params.suggestionId,
      platform: "trendyol",
      importRow: {
        importJobId: params.id,
        importJob: { storeId: ctx.storeId }
      }
    },
    include: {
      importRow: true,
      suggestedAttributes: {
        orderBy: [{ isRequired: "desc" }, { attributeName: "asc" }]
      }
    }
  });

  if (!suggestion) {
    return NextResponse.json({ error: "Öneri bulunamadı." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const previewRaw = searchParams.get("previewCategoryId");
  const previewCategoryId =
    previewRaw != null && previewRaw !== ""
      ? parseInt(previewRaw, 10)
      : NaN;

  const effectiveCategoryId =
    Number.isFinite(previewCategoryId) && previewCategoryId > 0
      ? previewCategoryId
      : suggestion.suggestedCategoryId;

  /** Marka listesi artık tam çekilmez; combobox /api/trendyol/brands/search ile aranır. */
  const selectedBrandRow =
    suggestion.suggestedBrandId != null
      ? await prisma.trendyolBrand.findFirst({
          where: { brandId: suggestion.suggestedBrandId }
        })
      : null;
  const brands =
    selectedBrandRow != null
      ? [{ brandId: selectedBrandRow.brandId, name: selectedBrandRow.name }]
      : [];

  const [categories, categoryAttrRows] = await Promise.all([
    prisma.trendyolCategory.findMany({
      where: {
        ...trendyolCategoryListableWhere,
        isLeaf: true
      },
      select: { categoryId: true, name: true, isLeaf: true },
      orderBy: { name: "asc" },
      take: 8000
    }),
    effectiveCategoryId != null
      ? prisma.trendyolCategoryAttribute.findMany({
          where: { categoryId: effectiveCategoryId },
          include: {
            values: { orderBy: { attributeValue: "asc" } }
          },
          orderBy: { attributeName: "asc" }
        })
      : Promise.resolve([] as CategoryAttrWithValues)
  ]);

  const categoryAttributes = serializeCategoryAttributes(categoryAttrRows);

  const missingList = parseMissingRequiredList(suggestion.missingRequiredAttributes);
  const missingRequiredCount = countMissingRequiredAttributes(
    suggestion.missingRequiredAttributes
  );

  return NextResponse.json({
    importJobId: params.id,
    suggestion: {
      id: suggestion.id,
      importRowId: suggestion.importRowId,
      platform: suggestion.platform,
      suggestedBrandId: suggestion.suggestedBrandId,
      suggestedBrandName: suggestion.suggestedBrandName,
      suggestedCategoryId: suggestion.suggestedCategoryId,
      suggestedCategoryName: suggestion.suggestedCategoryName,
      confidenceScore: suggestion.confidenceScore,
      confidenceBand: confidenceBand(suggestion.confidenceScore),
      aiReasoningSummary: suggestion.aiReasoningSummary,
      missingRequiredAttributes: suggestion.missingRequiredAttributes,
      missingRequiredList: missingList,
      missingRequiredCount,
      status: suggestion.status,
      suggestedAttributes: suggestion.suggestedAttributes,
      createdAt: suggestion.createdAt.toISOString(),
      updatedAt: suggestion.updatedAt.toISOString()
    },
    importRow: {
      id: suggestion.importRow.id,
      rowIndex: suggestion.importRow.rowIndex,
      rawData: suggestion.importRow.rawData,
      normalizedName: suggestion.importRow.normalizedName,
      normalizedDescription: suggestion.importRow.normalizedDescription,
      normalizedBrand: suggestion.importRow.normalizedBrand,
      normalizedCategoryText: suggestion.importRow.normalizedCategoryText,
      normalizedSku: suggestion.importRow.normalizedSku,
      normalizedBarcode: suggestion.importRow.normalizedBarcode,
      price: suggestion.importRow.price,
      stock: suggestion.importRow.stock,
      status: suggestion.importRow.status,
      errorMessage: suggestion.importRow.errorMessage
    },
    brands,
    categories,
    categoryAttributes,
    effectiveCategoryId,
    previewCategoryActive: Number.isFinite(previewCategoryId) && previewCategoryId > 0
  });
}

type PatchBody = {
  suggestedBrandId?: number | null;
  suggestedBrandName?: string | null;
  suggestedCategoryId?: number | null;
  suggestedCategoryName?: string | null;
  attributes?: Array<{
    attributeId: number;
    attributeName?: string;
    attributeValueId?: number | null;
    customValue?: string | null;
  }>;
  /** Kayıt + durum */
  status?: "suggested" | "approved" | "rejected";
};

function resolveValueForDef(
  def: CategoryAttributeDef,
  valueId: number | null,
  custom: string | null
): {
  attributeValueId: number | null;
  attributeValue: string | null;
  customValue: string | null;
} {
  const c = custom != null && String(custom).trim() !== "" ? String(custom).trim() : null;
  if (c != null) {
    if (!def.allowCustom) {
      throw new Error(`Özellik "${def.attributeName}" özel metin kabul etmiyor.`);
    }
    return { attributeValueId: null, attributeValue: null, customValue: c };
  }
  if (valueId != null && Number.isFinite(valueId)) {
    const v = def.values.find((x) => x.attributeValueId === valueId);
    if (!v) {
      throw new Error(
        `Özellik "${def.attributeName}" için geçersiz attributeValueId: ${valueId}. Bu kategori için Trendyol değer listesinde yok; kategori özellik senkronunu çalıştırın veya listeden başka bir değer seçin.`
      );
    }
    return {
      attributeValueId: valueId,
      attributeValue: v.attributeValue,
      customValue: null
    };
  }
  return { attributeValueId: null, attributeValue: null, customValue: null };
}

/**
 * PATCH — Öneriyi güncelle; kategori + özellikler; status approved / rejected / suggested.
 */
export async function PATCH(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const job = await prisma.importJob.findFirst({
    where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
  });
  if (!job) {
    return NextResponse.json({ error: "İçe aktarma bulunamadı." }, { status: 404 });
  }

  const existing = await prisma.importRowMarketplaceSuggestion.findFirst({
    where: {
      id: params.suggestionId,
      platform: "trendyol",
      importRow: {
        importJobId: params.id,
        importJob: { storeId: ctx.storeId }
      }
    },
    include: { suggestedAttributes: true }
  });

  if (!existing) {
    return NextResponse.json({ error: "Öneri bulunamadı." }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const statusIn = body.status;
  if (
    statusIn !== undefined &&
    statusIn !== "suggested" &&
    statusIn !== "approved" &&
    statusIn !== "rejected"
  ) {
    return NextResponse.json(
      { error: "status: suggested, approved veya rejected olmalı." },
      { status: 400 }
    );
  }

  let suggestedBrandId =
    body.suggestedBrandId !== undefined
      ? body.suggestedBrandId === null
        ? null
        : Number(body.suggestedBrandId)
      : existing.suggestedBrandId;

  let suggestedBrandName =
    body.suggestedBrandName !== undefined
      ? body.suggestedBrandName?.trim() || null
      : existing.suggestedBrandName;

  if (suggestedBrandId != null && !Number.isFinite(suggestedBrandId)) {
    return NextResponse.json({ error: "Geçersiz suggestedBrandId." }, { status: 400 });
  }

  if (suggestedBrandId != null) {
    const b = await prisma.trendyolBrand.findFirst({
      where: { brandId: suggestedBrandId, ...trendyolBrandListableWhere }
    });
    if (!b) {
      return NextResponse.json(
        { error: "Marka bulunamadı veya listede yok." },
        { status: 400 }
      );
    }
    suggestedBrandName = b.name;
  } else {
    suggestedBrandId = null;
    suggestedBrandName = null;
  }

  let suggestedCategoryId =
    body.suggestedCategoryId !== undefined
      ? body.suggestedCategoryId === null
        ? null
        : Number(body.suggestedCategoryId)
      : existing.suggestedCategoryId;

  let suggestedCategoryName =
    body.suggestedCategoryName !== undefined
      ? body.suggestedCategoryName?.trim() || null
      : existing.suggestedCategoryName;

  if (suggestedCategoryId != null && !Number.isFinite(suggestedCategoryId)) {
    return NextResponse.json({ error: "Geçersiz suggestedCategoryId." }, { status: 400 });
  }

  if (suggestedCategoryId != null) {
    const c = await prisma.trendyolCategory.findFirst({
      where: {
        categoryId: suggestedCategoryId,
        ...trendyolCategoryListableWhere,
        isLeaf: true
      }
    });
    if (!c) {
      return NextResponse.json(
        { error: "Kategori bulunamadı veya yaprak kategori değil." },
        { status: 400 }
      );
    }
    suggestedCategoryName = c.name;
  } else {
    suggestedCategoryId = null;
    suggestedCategoryName = null;
  }

  const bodyAttrs = Array.isArray(body.attributes) ? body.attributes : null;
  const fallbackAttrsFromDb =
    bodyAttrs == null
      ? existing.suggestedAttributes.map((a) => ({
          attributeId: a.attributeId,
          attributeName: a.attributeName,
          attributeValueId: a.attributeValueId,
          customValue: a.customValue
        }))
      : null;
  const effectiveBodyAttrs = bodyAttrs ?? fallbackAttrsFromDb ?? [];

  let missingJson: Prisma.InputJsonValue = {
    missingRequired: [] as Prisma.InputJsonValue[]
  };
  let rowsToCreate: Array<{
    attributeId: number;
    attributeName: string;
    attributeValueId: number | null;
    attributeValue: string | null;
    customValue: string | null;
    isRequired: boolean;
  }> = [];

  if (suggestedCategoryId == null) {
    missingJson = { missingRequired: [] };
    rowsToCreate = [];
  } else {
    /** UI tüm değerleri gösterir; doğrulama da aynı seti kullanmalı (ilk 120 kesilmesin). */
    const defs = await loadCategoryAttributeDefs(suggestedCategoryId, {
      allValues: true
    });
    const attrById = new Map(
      effectiveBodyAttrs.map((a) => [Number(a.attributeId), a])
    );

    const inputsForMissing: SuggestionAttributeInput[] = [];

    for (const def of defs) {
      const incoming = attrById.get(def.attributeId);
      const valueId =
        incoming?.attributeValueId !== undefined &&
        incoming?.attributeValueId !== null
          ? Number(incoming.attributeValueId)
          : null;
      const custom =
        incoming?.customValue !== undefined && incoming?.customValue !== null
          ? String(incoming.customValue)
          : null;

      try {
        const resolved = resolveValueForDef(def, valueId, custom);
        rowsToCreate.push({
          attributeId: def.attributeId,
          attributeName:
            String(incoming?.attributeName ?? "").trim() || def.attributeName,
          attributeValueId: resolved.attributeValueId,
          attributeValue: resolved.attributeValue,
          customValue: resolved.customValue,
          isRequired: def.isRequired
        });
        inputsForMissing.push({
          attributeId: def.attributeId,
          attributeValueId: resolved.attributeValueId,
          customValue: resolved.customValue
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    missingJson = buildMissingRequiredAttributesJson(defs, inputsForMissing) as unknown as Prisma.InputJsonValue;
  }

  const nextStatus = statusIn ?? existing.status;

  const suggestionWriteWhere = {
    id: existing.id,
    importRow: {
      importJob: {
        id: params.id,
        storeId: ctx.storeId
      }
    }
  };

  try {
    await prisma.$transaction(async (tx) => {
      const u = await tx.importRowMarketplaceSuggestion.updateMany({
        where: suggestionWriteWhere,
        data: {
          suggestedBrandId,
          suggestedBrandName,
          suggestedCategoryId,
          suggestedCategoryName,
          missingRequiredAttributes: missingJson,
          status: nextStatus,
          updatedAt: new Date()
        }
      });
      if (u.count === 0) {
        throw new Error("SUGGESTION_UPDATE_FAILED");
      }

      await tx.importRowMarketplaceSuggestedAttribute.deleteMany({
        where: { suggestionId: existing.id }
      });

      if (rowsToCreate.length > 0) {
        await tx.importRowMarketplaceSuggestedAttribute.createMany({
          data: rowsToCreate.map((r) => ({
            suggestionId: existing.id,
            attributeId: r.attributeId,
            attributeName: r.attributeName,
            attributeValueId: r.attributeValueId,
            attributeValue: r.attributeValue,
            customValue: r.customValue,
            isRequired: r.isRequired
          }))
        });
      }
    });
  } catch (e) {
    console.error("trendyol-suggestion PATCH:", e);
    if (e instanceof Error && e.message === "SUGGESTION_UPDATE_FAILED") {
      return NextResponse.json({ error: "Öneri bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ error: "Kayıt sırasında hata oluştu." }, { status: 500 });
  }

  const fresh = await prisma.importRowMarketplaceSuggestion.findFirst({
    where: suggestionWriteWhere,
    include: {
      importRow: true,
      suggestedAttributes: {
        orderBy: [{ isRequired: "desc" }, { attributeName: "asc" }]
      }
    }
  });

  if (!fresh) {
    return NextResponse.json({ success: true });
  }

  const missingList = parseMissingRequiredList(fresh.missingRequiredAttributes);

  return NextResponse.json({
    success: true,
    suggestion: {
      id: fresh.id,
      importRowId: fresh.importRowId,
      suggestedBrandId: fresh.suggestedBrandId,
      suggestedBrandName: fresh.suggestedBrandName,
      suggestedCategoryId: fresh.suggestedCategoryId,
      suggestedCategoryName: fresh.suggestedCategoryName,
      confidenceScore: fresh.confidenceScore,
      confidenceBand: confidenceBand(fresh.confidenceScore),
      aiReasoningSummary: fresh.aiReasoningSummary,
      missingRequiredAttributes: fresh.missingRequiredAttributes,
      missingRequiredList: missingList,
      missingRequiredCount: countMissingRequiredAttributes(
        fresh.missingRequiredAttributes
      ),
      status: fresh.status,
      suggestedAttributes: fresh.suggestedAttributes
    }
  });
}
