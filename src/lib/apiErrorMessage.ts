/**
 * API JSON veya ham metin gövdesinden kullanıcıya gösterilecek metin üretir.
 * Yapı: `resolveUserErrorMessage` (`error.code` / `error.userMessage` dahil).
 */
import { resolveUserErrorMessage } from "@/lib/errors/resolveUserErrorMessage";

export function formatApiErrorMessage(
  status: number,
  statusText: string,
  bodyText: string
): string {
  const trimmed = bodyText?.trim() ?? "";
  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const data = JSON.parse(trimmed) as unknown;
      return resolveUserErrorMessage(data, {
        fallback: `İstek başarısız (HTTP ${status}${statusText ? ` ${statusText}` : ""}).`
      });
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
