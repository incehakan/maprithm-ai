import { logger, type LogContext } from "@/lib/logger";

/** Yeni API hata gövdesi ve katalog için bkz. `src/lib/errors/`. */

export type ApiErrorPayload = {
  success: false;
  error: string;
  requestId?: string;
};

export function normalizeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

export function safeClientErrorMessage(message: string): string {
  if (process.env.NODE_ENV === "production") {
    return "İşlem sırasında bir hata oluştu.";
  }
  return message;
}

export function logAndBuildApiError(params: {
  err: unknown;
  fallbackMessage: string;
  requestId?: string;
  context?: LogContext;
}): ApiErrorPayload {
  const raw = normalizeErrorMessage(params.err, params.fallbackMessage);
  logger.error(raw, {
    ...params.context,
    requestId: params.requestId ?? null,
    stack: params.err instanceof Error ? params.err.stack : undefined
  });
  return {
    success: false,
    error: safeClientErrorMessage(raw),
    requestId: params.requestId
  };
}

