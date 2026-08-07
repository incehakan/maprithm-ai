import { logger } from "@/lib/logger";

export type HttpRetryOptions = {
  timeoutMs?: number;
  /** Varsayılan 2. Multipart gibi idempotent olmayan isteklerde 0 verin. */
  maxRetries?: number;
  retryDelayMs?: number;
  retryOnStatuses?: number[];
  requestName?: string;
  requestId?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry-After header'ını ayrıştırır. HTTP standardına göre iki biçimde
 * gelebilir: saniye cinsinden tam sayı ("120") veya HTTP-date. Hepsiburada
 * rate limit aşımında (429) X-RateLimit-Reset (saniye) da döndürebiliyor —
 * o da burada fallback olarak kontrol edilir.
 */
function parseRetryAfterMs(res: Response): number | null {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const asSeconds = Number(retryAfter);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) return asSeconds * 1000;
    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) {
      const diff = asDate - Date.now();
      if (diff > 0) return diff;
    }
  }
  const rateLimitReset = res.headers.get("x-ratelimit-reset");
  if (rateLimitReset) {
    const asSeconds = Number(rateLimitReset);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) return asSeconds * 1000;
  }
  return null;
}


function isRetryableNetworkError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("socket")
  );
}

export async function fetchWithTimeoutAndRetry(
  input: string,
  init: RequestInit,
  options?: HttpRetryOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const maxRetries = options?.maxRetries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 900;
  const retryOnStatuses = options?.retryOnStatuses ?? [408, 429, 500, 502, 503, 504];

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(t);
      if (retryOnStatuses.includes(res.status) && attempt < maxRetries) {
        const retryAfterMs = parseRetryAfterMs(res);
        const delay = retryAfterMs ?? retryDelayMs * (attempt + 1);
        if (res.status === 429) {
          logger.warn("rate_limited", {
            helper: "fetchWithTimeoutAndRetry",
            requestName: options?.requestName,
            requestId: options?.requestId ?? null,
            attempt,
            retryAfterMs: retryAfterMs ?? null,
            waitedMs: delay
          });
        }
        await sleep(delay);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(t);
      lastError = err;
      if (!isRetryableNetworkError(err) || attempt >= maxRetries) {
        break;
      }
      logger.warn("retryable_network_error", {
        helper: "fetchWithTimeoutAndRetry",
        requestName: options?.requestName,
        requestId: options?.requestId ?? null,
        attempt
      });
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("HTTP request failed");
}

