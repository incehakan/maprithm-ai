import type { MarketplaceConnection } from "@prisma/client";

export function resolveTrendyolCheSupplierId(
  conn: Pick<MarketplaceConnection, "sellerId" | "cheSupplierId">
): string {
  const explicit = conn.cheSupplierId?.trim();
  if (explicit) return explicit;
  return String(conn.sellerId ?? "").trim();
}
