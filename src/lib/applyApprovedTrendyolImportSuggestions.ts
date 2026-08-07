import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  evaluateTrendyolMappingReadiness,
  type CategoryAttrDef,
  type SavedMappingAttr
} from "@/lib/trendyolMappingReadiness";
import { createActivityLog } from "@/lib/activityLog";
import {
  buildProductMainId,
  resolveTrendyolBarcodeForImportRow,
  resolveTrendyolStockCodeForImportRow
} from "@/lib/trendyolImportRowResolve";
import {
  getProductDisplayNameForMapping,
  validateSuggestionForMapping
} from "@/lib/validateSuggestionForMapping";
import { normalizeImageUrls } from "@/lib/productImages";
import { isImportUsable } from "@/lib/importStatus";

export type ApplyApprovedSuggestionResult = {
  suggestionId: string;
  importRowId: string;
  ok: boolean;
  productId?: string;
  mappingId?: string;
  publishStatus?: string;
  message?: string;
};

/** Geriye dönük uyumluluk — yeni kod `trendyolImportRowResolve` kullanır */
export {
  compactBarcodeFromImportRowId,
  resolveTrendyolBarcodeForImportRow,
  resolveTrendyolStockCodeForImportRow
} from "@/lib/trendyolImportRowResolve";

type SuggestionWithRowAndAttrs = Prisma.ImportRowMarketplaceSuggestionGetPayload<{
  include: { importRow: true; suggestedAttributes: true };
}>;

export type ApplyMappingSuccessItem = {
  suggestionId: string;
  rowIndex: number;
  productName: string;
  message: string;
};

export type ApplyMappingFailureItem = {
  suggestionId: string;
  rowIndex: number;
  productName: string;
  reasons: string[];
};

export type ApplyMappingBatchResult = {
  total: number;
  successCount: number;
  failedCount: number;
  successes: ApplyMappingSuccessItem[];
  failures: ApplyMappingFailureItem[];
};

async function loadCategoryAttrDefsForReadiness(
  tx: Prisma.TransactionClient,
  categoryId: number
): Promise<CategoryAttrDef[]> {
  const rows = await tx.marketplaceAttribute.findMany({
    where: { platform: "TRENDYOL", categoryId: categoryId.toString() },
    select: {
      externalId: true,
      name: true,
      required: true
    },
    orderBy: { name: "asc" }
  });
  return rows.map((r: any) => ({
    attributeId: parseInt(r.externalId, 10),
    attributeName: r.name,
    isRequired: r.required
  }));
}

function toSavedAttrs(
  attrs: SuggestionWithRowAndAttrs["suggestedAttributes"]
): SavedMappingAttr[] {
  return attrs.map((a) => ({
    attributeId: a.attributeId,
    attributeValueId: a.attributeValueId,
    customValue: a.customValue
  }));
}

/**
 * Tek bir onaylı Trendyol import önerisini Product + ProductMarketplaceMapping'e uygular.
 * Transaction içinde çağrılmalı (caller $transaction ile sarar).
 */
export async function applyOneApprovedTrendyolSuggestionInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  storeId: string,
  importJobId: string,
  s: SuggestionWithRowAndAttrs
): Promise<ApplyApprovedSuggestionResult> {
  const row = s.importRow;

  const userSettingsRow = await tx.userSettings.findUnique({
    where: { storeId },
    select: { xmlBarcodePrefix: true }
  });
  const userSettingsPrefix = userSettingsRow?.xmlBarcodePrefix ?? null;

  if (s.suggestedCategoryId == null) {
    return {
      suggestionId: s.id,
      importRowId: row.id,
      ok: false,
      message: "Trendyol kategori id yok; mapping uygulanamadı."
    };
  }

  const skuTrim = row.normalizedSku?.trim() || null;
  let product = skuTrim
    ? await tx.product.findFirst({
        where: { userId, storeId, sku: skuTrim }
      })
    : null;

  const priceNum = row.price ?? 0;
  const stockNum = row.stock ?? 0;
  const parsedImageUrls = normalizeImageUrls([row.mainImageUrl, row.imageUrls]);
  const mainImageUrl = parsedImageUrls[0] ?? null;
  const imageUrlsJson =
    parsedImageUrls.length > 0
      ? (parsedImageUrls as Prisma.InputJsonValue)
      : Prisma.JsonNull;
  const name =
    row.normalizedName?.trim() || `İçe aktarılan ürün (satır ${row.rowIndex})`;

  if (!product) {
    product = await tx.product.create({
      data: {
        userId,
        storeId,
        name,
        description: row.normalizedDescription ?? null,
        price: new Prisma.Decimal(priceNum),
        stock: stockNum,
        sku: skuTrim,
        brand: row.normalizedBrand ?? null,
        category: row.normalizedCategoryText ?? null,
        status: "draft",
        lifecycleStatus: "draft",
        sourceImportJobId: importJobId,
        sourceImportRowId: row.id,
        createdFromImport: true,
        mainImageUrl,
        imageUrls: imageUrlsJson
      }
    });
  } else {
    await tx.product.update({
      where: { id: product.id },
      data: {
        mainImageUrl,
        imageUrls: imageUrlsJson
      }
    });
  }

  const barcode = resolveTrendyolBarcodeForImportRow(row, userSettingsPrefix);
  const stockCode = resolveTrendyolStockCodeForImportRow(row, importJobId);
  const productMainId = buildProductMainId(product.id);

  const categoryAttributeDefs = await loadCategoryAttrDefsForReadiness(
    tx,
    s.suggestedCategoryId
  );

  const savedAttributes = toSavedAttrs(s.suggestedAttributes);

  const readiness = evaluateTrendyolMappingReadiness(
    {
      trendyolBrandId: s.suggestedBrandId,
      trendyolCategoryId: s.suggestedCategoryId,
      barcode,
      stockCode,
      productMainId,
      salePrice: priceNum,
      quantity: stockNum,
      mainImageUrl,
      imageUrls: parsedImageUrls
    },
    categoryAttributeDefs,
    savedAttributes
  );

  const readyForMapping = readiness.missing.length === 0;

  const publishStatus = readyForMapping ? "ready" : "draft";
  const lifecycleStatus = readyForMapping ? "ready" : "draft";

  const mapping = await tx.productMarketplaceMapping.upsert({
    where: {
      productId_platform: {
        productId: product.id,
        platform: "trendyol"
      }
    },
    create: {
      productId: product.id,
      userId,
      storeId,
      platform: "trendyol",
      trendyolBrandId: s.suggestedBrandId,
      trendyolCategoryId: s.suggestedCategoryId,
      barcode,
      stockCode,
      productMainId,
      currencyType: "TRY",
      listPrice: null,
      salePrice: null,
      quantity: null,
      useProductPrice: true,
      useProductStock: true,
      publishStatus,
      ...(publishStatus === "ready" ? { lastSyncAt: new Date() } : {}),
      mainImageUrl,
      imageUrls: imageUrlsJson
    },
    update: {
      storeId,
      trendyolBrandId: s.suggestedBrandId,
      trendyolCategoryId: s.suggestedCategoryId,
      barcode,
      stockCode,
      productMainId,
      currencyType: "TRY",
      listPrice: null,
      salePrice: null,
      quantity: null,
      useProductPrice: true,
      useProductStock: true,
      publishStatus,
      ...(publishStatus === "ready" ? { lastSyncAt: new Date() } : {}),
      mainImageUrl,
      imageUrls: imageUrlsJson
    }
  });

  await tx.product.update({
    where: { id: product.id },
    data: { lifecycleStatus }
  });

  await tx.productMarketplaceAttribute.deleteMany({
    where: { mappingId: mapping.id }
  });

  for (const a of s.suggestedAttributes) {
    await tx.productMarketplaceAttribute.create({
      data: {
        mappingId: mapping.id,
        storeId,
        attributeId: a.attributeId,
        attributeName: a.attributeName,
        attributeValueId: a.attributeValueId,
        customValue: a.customValue
      }
    });
  }

  await tx.importRowMarketplaceSuggestion.update({
    where: { id: s.id },
    data: { status: "applied" }
  });

  return {
    suggestionId: s.id,
    importRowId: row.id,
    ok: true,
    productId: product.id,
    mappingId: mapping.id,
    publishStatus,
    message: readyForMapping
      ? "Ürün ve Trendyol eşlemesi hazır (ready) olarak kaydedildi."
      : "Ürün ve Trendyol eşlemesi taslak (draft) olarak kaydedildi; eksikler: " +
        readiness.missing.slice(0, 3).join("; ") +
        (readiness.missing.length > 3 ? "…" : "")
  };
}

export type ApplyApprovedSuggestionsBatchOptions = {
  prisma: PrismaClient;
  userId: string;
  storeId: string;
  importJobId: string;
  /** Verilmezse veya boşsa işteki tüm approved öneriler */
  suggestionIds?: string[] | null;
  /** En az bir başarılı uygulamada activity log yazar */
  logAction?: boolean;
};

/**
 * Onaylı önerileri sırayla uygular (her biri kendi transaction'ında).
 * Çift mapping oluşturmaz: productId + platform upsert.
 */
function toValidateShape(
  s: SuggestionWithRowAndAttrs
): Parameters<typeof validateSuggestionForMapping>[2] {
  return {
    id: s.id,
    status: s.status,
    suggestedBrandId: s.suggestedBrandId,
    suggestedCategoryId: s.suggestedCategoryId,
    suggestedAttributes: s.suggestedAttributes.map((a) => ({
      attributeId: a.attributeId,
      attributeValueId: a.attributeValueId,
      customValue: a.customValue
    })),
    importRow: s.importRow
  };
}

/**
 * Verilen öneri listesi için ön doğrulama + Product / mapping uygulaması.
 */
export async function runApplyMappingForSuggestionList(
  prisma: PrismaClient,
  userId: string,
  storeId: string,
  importJobId: string,
  suggestions: SuggestionWithRowAndAttrs[]
): Promise<ApplyMappingBatchResult> {
  const successes: ApplyMappingSuccessItem[] = [];
  const failures: ApplyMappingFailureItem[] = [];

  for (const s of suggestions) {
    const productName = getProductDisplayNameForMapping(s.importRow);
    const validation = await validateSuggestionForMapping(
      prisma,
      importJobId,
      toValidateShape(s)
    );

    if (!validation.isValid) {
      failures.push({
        suggestionId: s.id,
        rowIndex: s.importRow.rowIndex,
        productName,
        reasons: validation.reasons
      });
      continue;
    }

    try {
      const one = await prisma.$transaction((tx) =>
        applyOneApprovedTrendyolSuggestionInTx(tx, userId, storeId, importJobId, s)
      );
      if (one.ok) {
        successes.push({
          suggestionId: s.id,
          rowIndex: s.importRow.rowIndex,
          productName,
          message: one.message ?? "Mapping oluşturuldu."
        });
      } else {
        failures.push({
          suggestionId: s.id,
          rowIndex: s.importRow.rowIndex,
          productName,
          reasons: one.message
            ? [one.message]
            : ["Mapping kaydı oluşturulamadı."]
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "İşlem hatası";
      failures.push({
        suggestionId: s.id,
        rowIndex: s.importRow.rowIndex,
        productName,
        reasons: [msg]
      });
    }
  }

  return {
    total: suggestions.length,
    successCount: successes.length,
    failedCount: failures.length,
    successes,
    failures
  };
}

/**
 * Onaylı öneriler için ön doğrulama + Product / mapping uygulaması.
 */
export async function runApplyMappingBatch(
  options: ApplyApprovedSuggestionsBatchOptions
): Promise<ApplyMappingBatchResult> {
  const { prisma, userId, storeId, importJobId, suggestionIds } = options;

  const importJob = await prisma.importJob.findFirst({
    where: { id: importJobId, userId, storeId }
  });
  if (!importJob) {
    throw new Error("İçe aktarma bulunamadı.");
  }
  if (!isImportUsable(importJob)) {
    throw new Error("Pasif import verisiyle mapping uygulanamaz.");
  }

  const idFilter =
    Array.isArray(suggestionIds) && suggestionIds.length > 0
      ? suggestionIds.filter((x) => typeof x === "string" && x.length > 0)
      : null;

  const suggestions = await prisma.importRowMarketplaceSuggestion.findMany({
    where: {
      platform: "trendyol",
      status: "approved",
      importRow: { importJobId },
      ...(idFilter ? { id: { in: idFilter } } : {})
    },
    include: {
      importRow: true,
      suggestedAttributes: true
    },
    orderBy: { updatedAt: "asc" }
  });

  return runApplyMappingForSuggestionList(
    prisma,
    userId,
    storeId,
    importJobId,
    suggestions
  );
}

export async function applyApprovedTrendyolImportSuggestions(
  options: ApplyApprovedSuggestionsBatchOptions
): Promise<ApplyMappingBatchResult> {
  const { logAction = true, userId, storeId, importJobId } = options;

  const batch = await runApplyMappingBatch(options);

  if (logAction && batch.successCount > 0) {
    await createActivityLog({
      userId,
      storeId,
      action: "TRENDYOL_AI_MATCHING_APPLIED",
      entityType: "import_job",
      entityId: importJobId,
      message: "AI Trendyol eşleştirmeleri ürün kayıtlarına uygulandı"
    });
  }

  return batch;
}
