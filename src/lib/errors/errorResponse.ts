import { NextResponse } from "next/server";
import type { AppErrorCode } from "./appError";
import { AppError } from "./appError";
import { getCatalogEntry, normalizeTrendyolDomainCode } from "./errorCatalog";
import { logger, type LogContext } from "@/lib/logger";

const IS_DEV = process.env.NODE_ENV === "development";

export type ApiErrorBody = {
  success: false;
  error: {
    code: AppErrorCode;
    userMessage: string;
    field?: string;
    /** Yalnızca geliştirme ortamında dolu olabilir */
    internalMessage?: string;
    details?: Record<string, unknown>;
  };
};

export function buildApiErrorBody(
  code: AppErrorCode,
  userMessage: string,
  options?: {
    field?: string;
    internalMessage?: string;
    details?: Record<string, unknown>;
  }
): ApiErrorBody {
  const err: ApiErrorBody["error"] = {
    code,
    userMessage
  };
  if (options?.field) err.field = options.field;
  if (options?.details && Object.keys(options.details).length > 0) {
    err.details = options.details;
  }
  if (IS_DEV && options?.internalMessage?.trim()) {
    err.internalMessage = options.internalMessage.trim();
  }
  return { success: false, error: err };
}

export function logStructuredError(params: {
  message: string;
  code: AppErrorCode;
  internalMessage?: string;
  err?: unknown;
  context?: LogContext;
}): void {
  const stack = params.err instanceof Error ? params.err.stack : undefined;
  logger.error(params.message, {
    ...params.context,
    errorCode: params.code,
    internalMessage: params.internalMessage ?? null,
    stack
  });
}

export function createErrorResponse(
  err: unknown,
  options?: { route?: string; logContext?: LogContext }
): NextResponse<ApiErrorBody> {
  if (err instanceof AppError) {
    logStructuredError({
      message: err.userMessage,
      code: err.code,
      internalMessage: err.internalMessage,
      err,
      context: { ...options?.logContext, route: options?.route }
    });
    return NextResponse.json(
      buildApiErrorBody(err.code, err.userMessage, {
        field: err.field,
        internalMessage: err.internalMessage,
        details: err.details
      }),
      { status: err.httpStatus }
    );
  }

  const internalMessage =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);

  logStructuredError({
    message: "UNHANDLED_ERROR",
    code: "INTERNAL_ERROR",
    internalMessage,
    err: err instanceof Error ? err : undefined,
    context: { ...options?.logContext, route: options?.route }
  });

  const cat = getCatalogEntry("INTERNAL_ERROR");
  return NextResponse.json(
    buildApiErrorBody("INTERNAL_ERROR", cat.userMessage, {
      internalMessage
    }),
    { status: cat.httpStatus }
  );
}

type Override = {
  userMessage?: string;
  field?: string;
  internalMessage?: string;
  details?: Record<string, unknown>;
  logContext?: LogContext;
};

function jsonFromCode(
  code: AppErrorCode,
  httpStatus: number,
  overrides?: Override
): NextResponse<ApiErrorBody> {
  const cat = getCatalogEntry(code);
  const userMessage = overrides?.userMessage ?? cat.userMessage;
  const status = httpStatus;

  if (overrides?.internalMessage) {
    logStructuredError({
      message: userMessage,
      code,
      internalMessage: overrides.internalMessage,
      context: overrides.logContext
    });
  }

  return NextResponse.json(
    buildApiErrorBody(code, userMessage, {
      field: overrides?.field,
      internalMessage: overrides?.internalMessage,
      details: overrides?.details
    }),
    { status }
  );
}

export function badRequest(code: AppErrorCode = "VALIDATION_ERROR", overrides?: Override) {
  const cat = getCatalogEntry(code);
  return jsonFromCode(code, cat.httpStatus === 400 ? 400 : cat.httpStatus, overrides);
}

export function unauthorized(
  code: AppErrorCode = "UNAUTHORIZED",
  overrides?: Override
) {
  const cat = getCatalogEntry(code);
  return jsonFromCode(code, cat.httpStatus, overrides);
}

export function forbidden(code: AppErrorCode = "FORBIDDEN", overrides?: Override) {
  const cat = getCatalogEntry(code);
  return jsonFromCode(code, cat.httpStatus, overrides);
}

export function notFound(code: AppErrorCode = "NOT_FOUND", overrides?: Override) {
  const cat = getCatalogEntry(code);
  return jsonFromCode(code, cat.httpStatus, overrides);
}

export function internalServerError(
  code: AppErrorCode = "INTERNAL_ERROR",
  overrides?: Override
) {
  const cat = getCatalogEntry(code);
  return jsonFromCode(code, cat.httpStatus, overrides);
}

/** HTTP kodunu katalog üzerinden seçer (çoğu 4xx için uygun). */
export function jsonError(
  code: AppErrorCode,
  overrides?: Override & { httpStatus?: number }
): NextResponse<ApiErrorBody> {
  const cat = getCatalogEntry(code);
  const status = overrides?.httpStatus ?? cat.httpStatus;
  return jsonFromCode(code, status, overrides);
}

/**
 * Trendyol pipeline / batch satırındaki domain kodunu AppErrorCode'a çevirip gövde üretir.
 */
export function jsonErrorFromDomainCode(
  domainCode: string | undefined,
  overrides?: Override & { httpStatus?: number }
): NextResponse<ApiErrorBody> {
  const code = normalizeTrendyolDomainCode(domainCode);
  return jsonError(code, overrides);
}
