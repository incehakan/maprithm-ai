import { NextResponse } from "next/server";
import type { TrendyolPublishPipelineResult } from "@/lib/trendyolPublishProductPipeline";
import { getCatalogEntry, normalizeTrendyolDomainCode } from "./errorCatalog";
import { buildApiErrorBody } from "./errorResponse";
import { logger } from "@/lib/logger";

/**
 * Pipeline başarısız olduğunda: batch'teki ilk errorCode öncelikli.
 * `success` alanı batch içi başarılı satır sayısıdır (önceki API ile aynı); üst seviye başarı `accepted: false` ile anlaşılır.
 */
export function nextResponseFromPublishPipelineFailure(
  result: Extract<TrendyolPublishPipelineResult, { ok: false }>,
  logContext?: { route?: string; userId?: string; storeId?: string; productId?: string }
): NextResponse {
  const firstFailed = result.batch?.results?.find((r) => r.status === "FAILED");
  const domainCode = firstFailed?.errorCode;
  const code = normalizeTrendyolDomainCode(domainCode);
  const cat = getCatalogEntry(code);

  const userMessage =
    domainCode && code !== "VALIDATION_ERROR"
      ? cat.userMessage
      : result.error?.trim()
        ? result.error
        : cat.userMessage;

  logger.warn("publish_pipeline_failure", {
    helper: "publishPipelineError",
    code,
    domainCode: domainCode ?? null,
    httpStatus: result.httpStatus,
    pipelineMessage: result.error,
    ...logContext
  });

  const eb = buildApiErrorBody(code, userMessage, {
    internalMessage: result.error
  });

  return NextResponse.json(
    {
      accepted: false,
      error: eb.error,
      missing: result.missing,
      total: result.batch?.total ?? 0,
      success: result.batch?.success ?? 0,
      failed: result.batch?.failed ?? 0,
      pending: result.batch?.pending ?? 0,
      results: result.batch?.results ?? []
    },
    { status: result.httpStatus }
  );
}
