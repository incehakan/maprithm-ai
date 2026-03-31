import { prisma } from "@/lib/prisma";
import { trendyolFetch, trendyolPostJson } from "@/lib/trendyolFetch";

/** @see https://developers.trendyol.com/v2.0/docs/getting-customer-questions */
export type TrendyolCustomerQuestionListStatus =
  | "WAITING_FOR_ANSWER"
  | "WAITING_FOR_APPROVE"
  | "ANSWERED"
  | "REPORTED"
  | "REJECTED"
  | "UNANSWERED";

export type FilterTrendyolCustomerQuestionsQuery = {
  barcode?: string;
  page?: number;
  size?: number;
  /** Zorunlu; belirtilmezse mağaza sellerId kullanılır. */
  supplierId?: string;
  startDate?: number;
  endDate?: number;
  status?: TrendyolCustomerQuestionListStatus | string;
  orderByField?: "PackageLastModifiedDate" | "CreatedDate";
  orderByDirection?: "ASC" | "DESC";
};

export async function getTrendyolSellerIdForStore(storeId: string): Promise<string> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { sellerId: true }
  });
  if (!conn?.sellerId?.trim()) {
    throw new Error("Aktif Trendyol bağlantısı veya sellerId bulunamadı.");
  }
  return conn.sellerId.trim();
}

function buildFilterQueryString(
  sellerId: string,
  query: FilterTrendyolCustomerQuestionsQuery
): string {
  const supplierId = query.supplierId?.trim() || sellerId;
  const page = Math.max(0, Number.isFinite(query.page) ? Number(query.page) : 0);
  const rawSize = Number.isFinite(query.size) ? Number(query.size) : 20;
  const size = Math.min(50, Math.max(1, rawSize));

  const search = new URLSearchParams();
  search.set("supplierId", supplierId);
  search.set("page", String(page));
  search.set("size", String(size));

  if (query.barcode?.trim()) search.set("barcode", query.barcode.trim());
  if (query.startDate != null && Number.isFinite(query.startDate)) {
    search.set("startDate", String(Math.trunc(query.startDate)));
  }
  if (query.endDate != null && Number.isFinite(query.endDate)) {
    search.set("endDate", String(Math.trunc(query.endDate)));
  }
  if (query.status?.trim()) search.set("status", query.status.trim());
  if (query.orderByField) search.set("orderByField", query.orderByField);
  if (query.orderByDirection) search.set("orderByDirection", query.orderByDirection);

  return search.toString();
}

export async function filterTrendyolCustomerQuestions(params: {
  userId: string;
  storeId: string;
  query: FilterTrendyolCustomerQuestionsQuery;
  requestId?: string;
}): Promise<ReturnType<typeof trendyolFetch<unknown>>> {
  const sellerId = await getTrendyolSellerIdForStore(params.storeId);
  const qs = buildFilterQueryString(sellerId, params.query);
  const path = `/integration/qna/sellers/${sellerId}/questions/filter?${qs}`;
  return trendyolFetch(params.userId, params.storeId, path, {
    requestId: params.requestId
  });
}

export async function getTrendyolCustomerQuestionById(params: {
  userId: string;
  storeId: string;
  questionId: string;
  requestId?: string;
}): Promise<ReturnType<typeof trendyolFetch<unknown>>> {
  const sellerId = await getTrendyolSellerIdForStore(params.storeId);
  const id = params.questionId.trim();
  if (!id) {
    return { ok: false, status: 400, message: "Soru kimliği gerekli." };
  }
  const path = `/integration/qna/sellers/${sellerId}/questions/${encodeURIComponent(id)}`;
  return trendyolFetch(params.userId, params.storeId, path, {
    requestId: params.requestId
  });
}

/** @see https://developers.trendyol.com/v2.0/reference/answerquestion */
export async function answerTrendyolCustomerQuestion(params: {
  userId: string;
  storeId: string;
  questionId: string;
  text: string;
  requestId?: string;
}): Promise<ReturnType<typeof trendyolPostJson<unknown>>> {
  const sellerId = await getTrendyolSellerIdForStore(params.storeId);
  const id = params.questionId.trim();
  if (!id) {
    return { ok: false, status: 400, message: "Soru kimliği gerekli." };
  }
  const path = `/integration/qna/sellers/${sellerId}/questions/${encodeURIComponent(id)}/answers`;
  return trendyolPostJson(params.userId, params.storeId, path, { text: params.text }, {
    requestId: params.requestId
  });
}

export function parseCustomerQuestionsQueryFromSearchParams(
  sp: Record<string, string | string[] | undefined>
): FilterTrendyolCustomerQuestionsQuery {
  const g = (k: string) => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0];
    return v;
  };
  const num = (s: string | undefined) => {
    if (!s?.trim()) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    barcode: g("barcode")?.trim() || undefined,
    page: num(g("page")),
    size: num(g("size")),
    supplierId: g("supplierId")?.trim() || undefined,
    startDate: num(g("startDate")),
    endDate: num(g("endDate")),
    status: g("status")?.trim() || undefined,
    orderByField: (() => {
      const f = g("orderByField");
      return f === "CreatedDate" || f === "PackageLastModifiedDate" ? f : undefined;
    })(),
    orderByDirection: (() => {
      const d = g("orderByDirection");
      return d === "ASC" || d === "DESC" ? d : undefined;
    })()
  };
}
