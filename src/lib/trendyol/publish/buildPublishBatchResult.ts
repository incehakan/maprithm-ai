import type { PublishBatchResult, PublishItemResult } from "./types";

export function buildPublishBatchResult(results: PublishItemResult[]): PublishBatchResult {
  let success = 0;
  let failed = 0;
  let pending = 0;
  for (const r of results) {
    if (r.status === "SUCCESS") success += 1;
    else if (r.status === "FAILED") failed += 1;
    else pending += 1;
  }
  return {
    total: results.length,
    success,
    failed,
    pending,
    results
  };
}
