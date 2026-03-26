const MAX_CONCURRENT = 5;
let running = 0;
const waiters: Array<() => void> = [];

/**
 * Trendyol XML senkronu sırasında eşzamanlı API çağrılarını sınırlar (rate limit).
 */
export async function withTrendyolXmlSyncConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  while (running >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    const next = waiters.shift();
    if (next) next();
  }
}
