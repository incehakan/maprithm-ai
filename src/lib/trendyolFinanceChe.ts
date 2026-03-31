import { trendyolFetch } from "@/lib/trendyolFetch";
import type { TrendyolFetchResult } from "@/lib/trendyolFetch";

export type TrendyolFinanceKind = "settlements" | "otherfinancials";

export type TrendyolChePage = {
  page?: number;
  size?: number;
  totalPages?: number;
  totalElements?: number;
  content?: Record<string, unknown>[];
};

function buildChePath(
  sellerId: string,
  kind: TrendyolFinanceKind,
  qs: URLSearchParams
): string {
  const base = `/integration/finance/che/sellers/${encodeURIComponent(sellerId)}/${kind}`;
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}

export async function trendyolFetchChePage(input: {
  userId: string;
  storeId: string;
  sellerId: string;
  kind: TrendyolFinanceKind;
  supplierId: string;
  startDateMs: number;
  endDateMs: number;
  transactionType?: string;
  transactionTypes?: string;
  transactionSubType?: string;
  paymentOrderId?: string;
  paymentDate?: string;
  page?: number;
  size?: number;
}): Promise<TrendyolFetchResult<TrendyolChePage>> {
  const qs = new URLSearchParams();
  qs.set("supplierId", input.supplierId);
  qs.set("startDate", String(Math.trunc(input.startDateMs)));
  qs.set("endDate", String(Math.trunc(input.endDateMs)));
  if (input.transactionTypes?.trim()) {
    qs.set("transactionTypes", input.transactionTypes.trim());
  } else if (input.transactionType?.trim()) {
    qs.set("transactionType", input.transactionType.trim());
  }
  if (input.transactionSubType?.trim()) {
    qs.set("transactionSubType", input.transactionSubType.trim());
  }
  if (input.paymentOrderId?.trim()) {
    qs.set("paymentOrderId", input.paymentOrderId.trim());
  }
  if (input.paymentDate?.trim()) {
    qs.set("paymentDate", input.paymentDate.trim());
  }
  if (input.page != null && Number.isFinite(input.page)) {
    qs.set("page", String(Math.max(0, Math.trunc(input.page))));
  }
  const size =
    input.size === 1000 || input.size === 500
      ? input.size
      : 500;
  qs.set("size", String(size));

  const path = buildChePath(input.sellerId, input.kind, qs);
  return trendyolFetch<TrendyolChePage>(input.userId, input.storeId, path);
}

export function parseCheLine(
  row: Record<string, unknown>,
  kind: TrendyolFinanceKind
): {
  externalId: string;
  transactionDateMs: bigint | null;
  transactionType: string | null;
  orderNumber: string | null;
  paymentOrderId: string | null;
  barcode: string | null;
  debt: number | null;
  credit: number | null;
  sellerRevenue: number | null;
  commissionAmount: number | null;
  description: string | null;
  raw: Record<string, unknown>;
} | null {
  const idRaw = row.id;
  const externalId =
    idRaw != null && String(idRaw).trim() ? String(idRaw).trim() : "";
  if (!externalId) return null;

  const n = (v: unknown): number | null => {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
    return null;
  };

  const txDate = row.transactionDate;
  const transactionDateMs =
    typeof txDate === "number" && Number.isFinite(txDate)
      ? BigInt(Math.trunc(txDate))
      : txDate != null && String(txDate).trim() && Number.isFinite(Number(txDate))
        ? BigInt(Math.trunc(Number(txDate)))
        : null;

  return {
    externalId,
    transactionDateMs,
    transactionType:
      typeof row.transactionType === "string" ? row.transactionType : null,
    orderNumber:
      row.orderNumber != null ? String(row.orderNumber) : null,
    paymentOrderId:
      row.paymentOrderId != null ? String(row.paymentOrderId) : null,
    barcode: row.barcode != null ? String(row.barcode) : null,
    debt: n(row.debt),
    credit: n(row.credit),
    sellerRevenue: n(row.sellerRevenue),
    commissionAmount: n(row.commissionAmount),
    description:
      typeof row.description === "string" ? row.description : null,
    raw: row
  };
}
