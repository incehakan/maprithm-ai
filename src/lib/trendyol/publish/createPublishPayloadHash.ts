import { createHash } from "crypto";

/**
 * Deterministic hash for publish payload (debug / dedup / audit).
 */
export function createPublishPayloadHash(body: unknown): string {
  const normalized =
    body != null && typeof body === "object"
      ? stableStringify(body as Record<string, unknown>)
      : String(body);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = obj[k];
    out[k] = normalizeValue(v);
  }
  return JSON.stringify(out);
}

function normalizeValue(v: unknown): unknown {
  if (v == null) return v;
  if (Array.isArray(v)) return v.map((x) => normalizeValue(x));
  if (typeof v === "object") return stableStringify(v as Record<string, unknown>);
  return v;
}
