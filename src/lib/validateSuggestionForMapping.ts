import type { PrismaClient } from "@prisma/client";
import {
  evaluateTrendyolMappingReadiness,
  type CategoryAttrDef,
  type SavedMappingAttr
} from "@/lib/trendyolMappingReadiness";
import {
  resolveTrendyolBarcodeForImportRow,
  resolveTrendyolStockCodeForImportRow
} from "@/lib/trendyolImportRowResolve";

/** validateSuggestionForMapping ile uyumlu satır + öneri şekli */
export type ImportRowForMappingValidate = {
  rowIndex: number;
  normalizedName: string | null;
  normalizedSku: string | null;
  normalizedBarcode: string | null;
  mainImageUrl: string | null;
  imageUrls: unknown;
  price: number | null;
  stock: number | null;
};

export type SuggestionForMappingValidate = {
  id: string;
  status: string;
  suggestedBrandId: number | null;
  suggestedCategoryId: number | null;
  suggestedAttributes: Array<{
    attributeId: number;
    attributeValueId: number | null;
    customValue: string | null;
  }>;
  importRow: ImportRowForMappingValidate & {
    id: string;
  };
};

export function getProductDisplayNameForMapping(
  row: Pick<ImportRowForMappingValidate, "normalizedName" | "rowIndex">
): string {
  const n = row.normalizedName?.trim();
  if (n) return n;
  return `İçe aktarılan ürün (satır ${row.rowIndex})`;
}

function toSavedAttrs(
  attrs: SuggestionForMappingValidate["suggestedAttributes"]
): SavedMappingAttr[] {
  return attrs.map((a) => ({
    attributeId: a.attributeId,
    attributeValueId: a.attributeValueId,
    customValue: a.customValue
  }));
}

/**
 * Mapping’e uygulamadan önce: kategori/marka, ürün adı, fiyat, stok ve (kategori varsa)
 * zorunlu Trendyol özellikleri + readiness (görsel dahil).
 */
export async function validateSuggestionForMapping(
  db: PrismaClient,
  importJobId: string,
  suggestion: SuggestionForMappingValidate
): Promise<{ isValid: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  const row = suggestion.importRow;

  if (suggestion.status !== "approved") {
    reasons.push("Öneri onaylanmamış; mapping için önce onaylayın.");
  }

  if (suggestion.suggestedCategoryId == null) {
    reasons.push("Trendyol kategorisi seçilmedi.");
  }

  if (suggestion.suggestedBrandId == null) {
    reasons.push("Trendyol markası seçilmedi.");
  }

  const nameTrim = row.normalizedName?.trim();
  if (!nameTrim) {
    reasons.push("Ürün adı eksik (içe aktarma satırında görünen ad yok).");
  }

  const price = row.price;
  if (price == null || !Number.isFinite(Number(price))) {
    reasons.push("Satış fiyatı eksik veya geçersiz.");
  } else if (Number(price) <= 0) {
    reasons.push("Satış fiyatı 0'dan büyük olmalı.");
  }

  const stock = row.stock;
  if (stock == null || !Number.isFinite(Number(stock))) {
    reasons.push("Stok bilgisi eksik veya geçersiz.");
  } else if (Number(stock) < 0) {
    reasons.push("Stok negatif olamaz.");
  } else if (Number(stock) === 0) {
    reasons.push("Stok 0'dan büyük olmalı (Trendyol eşlemesi için).");
  }

  if (reasons.length > 0) {
    return { isValid: false, reasons };
  }

  const categoryId = suggestion.suggestedCategoryId!;
  const rows = await db.trendyolCategoryAttribute.findMany({
    where: { categoryId },
    select: {
      attributeId: true,
      attributeName: true,
      isRequired: true
    },
    orderBy: { attributeName: "asc" }
  });

  const categoryAttributeDefs: CategoryAttrDef[] = rows.map((r) => ({
    attributeId: r.attributeId,
    attributeName: r.attributeName,
    isRequired: r.isRequired
  }));

  const barcode = resolveTrendyolBarcodeForImportRow(row);
  const stockCode = resolveTrendyolStockCodeForImportRow(row, importJobId);
  const previewMainId = "MAPRITHM-önizleme";

  const readiness = evaluateTrendyolMappingReadiness(
    {
      trendyolBrandId: suggestion.suggestedBrandId,
      trendyolCategoryId: suggestion.suggestedCategoryId,
      barcode,
      stockCode,
      productMainId: previewMainId,
      salePrice: Number(price),
      quantity: Number(stock),
      mainImageUrl: row.mainImageUrl ?? null,
      imageUrls: row.imageUrls
    },
    categoryAttributeDefs,
    toSavedAttrs(suggestion.suggestedAttributes)
  );

  for (const m of readiness.missing) {
    reasons.push(m);
  }

  return {
    isValid: reasons.length === 0,
    reasons
  };
}
