/**
 * Parse edilmiş kayıtları ImportRow create payload'larına ve iş sayaçlarına dönüştürür.
 */

import { normalizeImportRow } from "./importNormalize";
import type { ParsedImportRecord } from "./importParseTypes";
import type { Prisma } from "@prisma/client";

export type ImportJobRowBuildResult = {
  payloads: Prisma.ImportRowCreateManyInput[];
  totalRows: number;
  successRows: number;
  failedRows: number;
};

export type BuildImportRowPayloadsOptions = {
  /** Doluysa her satırın normalizedBrand değeri buna çekilir (dosyadan gelen marka ezilir). */
  overrideBrand?: string | null;
};

/**
 * @param importJobId - oluşturulmuş ImportJob id
 * @param records - parse çıktısı (ham raw + isteğe bağlı satır hatası)
 */
export function buildImportRowPayloads(
  importJobId: string,
  records: ParsedImportRecord[],
  options?: BuildImportRowPayloadsOptions
): ImportJobRowBuildResult {
  const overrideBrand = options?.overrideBrand?.trim() || null;
  let success = 0;
  let failed = 0;

  const payloads: Prisma.ImportRowCreateManyInput[] = records.map((rec) => {
    const hasParserError = Boolean(rec.errorMessage);
    const norm = normalizeImportRow(rec.raw);
    const status = hasParserError
      ? "failed"
      : norm.rowStatus === "normalized"
        ? "normalized"
        : "pending";

    if (hasParserError) failed += 1;
    else success += 1;

    return {
      importJobId,
      rowIndex: rec.rowIndex,
      rawData: rec.raw as Prisma.InputJsonValue,
      normalizedName: norm.normalizedName ?? null,
      normalizedDescription: norm.normalizedDescription ?? null,
      normalizedBrand:
        overrideBrand && overrideBrand.length > 0
          ? overrideBrand
          : norm.normalizedBrand ?? null,
      normalizedCategoryText: norm.normalizedCategoryText ?? null,
      normalizedSku: norm.normalizedSku ?? null,
      normalizedBarcode: norm.normalizedBarcode ?? null,
      mainImageUrl: norm.mainImageUrl ?? null,
      imageUrls:
        norm.imageUrls && norm.imageUrls.length > 0
          ? (norm.imageUrls as Prisma.InputJsonValue)
          : undefined,
      price: norm.price ?? null,
      stock: norm.stock ?? null,
      status,
      errorMessage: rec.errorMessage ?? null
    };
  });

  return {
    payloads,
    totalRows: records.length,
    successRows: success,
    failedRows: failed
  };
}
