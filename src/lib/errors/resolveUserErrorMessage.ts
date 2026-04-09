import type { AppErrorCode } from "./appError";
import { ERROR_CATALOG } from "./errorCatalog";

const FALLBACK =
  "İşlem sırasında beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.";

function isAppErrorShape(
  v: unknown
): v is { code: AppErrorCode; userMessage: string; field?: string } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.code === "string" &&
    typeof o.userMessage === "string" &&
    o.userMessage.trim().length > 0
  );
}

function appendMissingList(
  data: Record<string, unknown>,
  text: string
): string {
  const missing = data.missing;
  if (Array.isArray(missing) && missing.length > 0) {
    return `${text} (Eksikler: ${missing.map(String).join(", ")})`;
  }
  return text;
}

/**
 * API yanıt gövdesinden (veya yakalanan Error) kullanıcıya gösterilecek tek Türkçe metin.
 * Yeni: `error: { code, userMessage }` — eski: `error` string, `message`, `detail`, `legacyError`.
 */
export function resolveUserErrorMessage(
  data: unknown,
  options?: { fallback?: string }
): string {
  const fallback = options?.fallback ?? FALLBACK;

  if (data == null) return fallback;

  if (typeof data === "string" && data.trim()) return data.trim();

  if (data instanceof Error && data.message.trim()) {
    return data.message.trim();
  }

  if (typeof data !== "object") return fallback;

  const d = data as Record<string, unknown>;

  let base: string | null = null;

  const nested = d.error;
  if (isAppErrorShape(nested)) {
    base = nested.userMessage.trim();
  } else if (typeof nested === "string" && nested.trim()) {
    base = nested.trim();
  }

  if (base == null) {
    const msg = d.userMessage;
    if (typeof msg === "string" && msg.trim()) base = msg.trim();
  }
  if (base == null) {
    const message = d.message;
    if (typeof message === "string" && message.trim()) base = message.trim();
  }
  if (base == null) {
    const legacy = d.legacyError;
    if (typeof legacy === "string" && legacy.trim()) base = legacy.trim();
  }
  if (base == null) {
    const detail = d.detail;
    if (typeof detail === "string" && detail.trim()) base = detail.trim();
  }
  if (base == null) {
    const details = d.details;
    if (typeof details === "string" && details.trim()) base = details.trim();
  }

  const resolved = base ?? fallback;
  return appendMissingList(d, resolved);
}

/**
 * HTTP yanıtını parse edip metin döndürür (JSON veya ham metin).
 */
export async function resolveUserErrorMessageFromResponse(
  response: Response,
  bodyText: string
): Promise<string> {
  const fallback = `İstek başarısız (HTTP ${response.status}).`;
  const trimmed = bodyText?.trim() ?? "";
  if (!trimmed) return fallback;

  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const data = JSON.parse(trimmed) as unknown;
      return resolveUserErrorMessage(data, { fallback });
    }
  } catch {
    const snippet = trimmed.replace(/\s+/g, " ").slice(0, 220);
    return snippet || fallback;
  }

  return trimmed.slice(0, 500) || fallback;
}

/** Kod biliniyorsa katalogdan güvenli varsayılan mesaj (UI ipuçları için). */
export function userMessageForCode(code: string | undefined | null): string {
  if (!code) return FALLBACK;
  const entry = ERROR_CATALOG[code as AppErrorCode];
  return entry?.userMessage ?? FALLBACK;
}
