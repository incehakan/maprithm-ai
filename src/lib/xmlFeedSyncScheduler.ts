import { prisma } from "@/lib/prisma";

/**
 * Zamanı gelmiş aktif XML feed'leri senkronize eder (storeId + userId feed kaydından).
 * Cron: örn. her dakika GET /api/cron/xml-feed-sync ile tetikleyin.
 * Aynı feed için eşzamanlı ikinci çalıştırma runXmlFeedSync kilidiyle reddedilir.
 */
export async function runXmlFeedSchedulerTick(): Promise<void> {
  const { runXmlFeedSync } = await import("@/lib/xmlFeedSync");
  const now = Date.now();

  const feeds = await prisma.xmlFeedSource.findMany({
    where: { isActive: true },
    select: {
      id: true,
      userId: true,
      storeId: true,
      syncIntervalMinutes: true,
      lastSyncedAt: true
    }
  });

  for (const feed of feeds) {
    const intervalMs = Math.max(1, feed.syncIntervalMinutes) * 60_000;
    const last = feed.lastSyncedAt?.getTime() ?? 0;
    if (now - last < intervalMs) continue;

    try {
      await runXmlFeedSync({
        userId: feed.userId,
        storeId: feed.storeId,
        xmlFeedSourceId: feed.id,
        trigger: "scheduled"
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("zaten çalışıyor")) continue;
      console.error(`[xml-feed-scheduler] feed ${feed.id}:`, err);
    }
  }
}
