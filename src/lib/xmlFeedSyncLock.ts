const busyFeedIds = new Set<string>();

export function tryAcquireXmlFeedSyncLock(feedId: string): boolean {
  if (busyFeedIds.has(feedId)) return false;
  busyFeedIds.add(feedId);
  return true;
}

export function releaseXmlFeedSyncLock(feedId: string): void {
  busyFeedIds.delete(feedId);
}

export function isXmlFeedSyncLocked(feedId: string): boolean {
  return busyFeedIds.has(feedId);
}
