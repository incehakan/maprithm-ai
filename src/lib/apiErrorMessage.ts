/**
 * API JSON veya ham metin gövdesinden kullanıcıya gösterilecek metin üretir.
 * Yapı: `resolveUserErrorMessage` (`error.code` / `error.userMessage` dahil).
 *
 * Dikkat: `ApiErrorBody.error` bir objedir (`{ code, userMessage, ... }`).
 * `data.error.message` yoktur — `userMessage` kullanın. Aksi halde
 * `throw new Error(data.error)` → "[object Object]" üretir.
 */
import { resolveUserErrorMessage } from "@/lib/errors/resolveUserErrorMessage";

/**
 * Parse edilmiş API JSON gövdesinden kullanıcı mesajı çıkarır.
 *
 * Öncelik: `error.userMessage` → `error.internalMessage` (dev) →
 * string `error` → diğer legacy alanlar → `fallback`.
 *
 * Asla Error()'a ham `error` objesi vermeyin; bu fonksiyonu kullanın.
 */
export function extractApiErrorMessage(
  data: unknown,
  fallback: string
): string {
  if (data && typeof data === "object") {
    const err = (data as Record<string, unknown>).error;
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      if (typeof e.userMessage === "string" && e.userMessage.trim()) {
        return e.userMessage.trim();
      }
      if (
        typeof e.internalMessage === "string" &&
        e.internalMessage.trim()
      ) {
        return e.internalMessage.trim();
      }
    } else if (typeof err === "string" && err.trim()) {
      return err.trim();
    }
  }

  return resolveUserErrorMessage(data, { fallback });
}

export function formatApiErrorMessage(
  status: number,
  statusText: string,
  bodyText: string
): string {
  const trimmed = bodyText?.trim() ?? "";
  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const data = JSON.parse(trimmed) as unknown;
      return extractApiErrorMessage(
        data,
        `İstek başarısız (HTTP ${status}${statusText ? ` ${statusText}` : ""}).`
      );
    }
  } catch {
    const snippet = trimmed.replace(/\s+/g, " ").slice(0, 220);
    if (snippet) {
      return `Sunucu yanıtı (${status}): ${snippet}`;
    }
  }

  if (trimmed) return trimmed.slice(0, 500);

  return `İstek başarısız (HTTP ${status}${statusText ? ` ${statusText}` : ""}).`;
}
