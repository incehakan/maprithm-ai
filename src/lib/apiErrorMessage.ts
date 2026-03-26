/**
 * API JSON veya HTML hata gövdesinden kullanıcıya gösterilecek metin üretir.
 */
export function formatApiErrorMessage(
  status: number,
  statusText: string,
  bodyText: string
): string {
  const trimmed = bodyText?.trim() ?? "";
  let data: Record<string, unknown> = {};
  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      data = JSON.parse(trimmed) as Record<string, unknown>;
    }
  } catch {
    const snippet = trimmed.replace(/\s+/g, " ").slice(0, 220);
    if (snippet) {
      return `Sunucu yanıtı (${status}): ${snippet}`;
    }
    return `İstek başarısız (HTTP ${status}${statusText ? ` ${statusText}` : ""}).`;
  }

  const parts: string[] = [];
  const err = data.error;
  if (typeof err === "string" && err.trim()) parts.push(err.trim());
  else if (Array.isArray(err)) parts.push(err.map(String).join("; "));

  const msg = data.message;
  if (typeof msg === "string" && msg.trim()) parts.push(msg.trim());

  const detail = data.detail;
  if (typeof detail === "string" && detail.trim()) parts.push(detail.trim());

  if (Array.isArray(data.missing) && data.missing.length > 0) {
    parts.push(`Eksikler: ${data.missing.map(String).join("; ")}`);
  }

  if (parts.length > 0) return parts.join(" — ");

  return `İstek başarısız (HTTP ${status}${statusText ? ` ${statusText}` : ""}).`;
}
