import { processOrderSyncQueue } from "@/lib/trendyolOrderBackgroundSync";

/**
 * Kuyruk işlemcisini tetikler: CRON_SECRET varsa HTTP ile, yoksa doğrudan işler (geliştirme).
 */
export async function triggerOrderSyncProcessing(requestUrl: string): Promise<void> {
  const origin = new URL(requestUrl).origin;
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    void fetch(`${origin}/api/cron/trendyol-orders-background`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ processOnly: true })
    }).catch(() => {});
    return;
  }
  await processOrderSyncQueue({ maxJobs: 8 });
}
