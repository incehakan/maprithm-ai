import { extractBatchRequestId } from "@/lib/trendyolCreateProductPayload";
import { TrendyolPublishRuntimeErrorCode } from "@/lib/validation/trendyolPublishErrorCodes";
import type { PublishItemResult } from "./types";

export type ParseTrendyolPublishResponseContext = {
  productId: string;
  mappingId: string;
  barcode: string | null;
  stockCode?: string | null;
  productMainId?: string | null;
};

export type ParseTrendyolPublishResponseInput = {
  httpOk: boolean;
  httpStatus: number;
  httpMessage?: string;
  data: unknown;
  context: ParseTrendyolPublishResponseContext;
};

function asTrimmedString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function normBarcode(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function matchesContext(
  ctx: ParseTrendyolPublishResponseContext,
  barcode: string | null,
  stockCode: string | null,
  productMainId: string | null
): boolean {
  const b = normBarcode(ctx.barcode);
  const bc = normBarcode(barcode);
  if (b && bc && b === bc) return true;
  const sc = normBarcode(ctx.stockCode ?? null);
  const sc2 = normBarcode(stockCode);
  if (sc && sc2 && sc === sc2) return true;
  const pm = normBarcode(ctx.productMainId ?? null);
  const pm2 = normBarcode(productMainId);
  if (pm && pm2 && pm === pm2) return true;
  return false;
}

function extractIdentifiersFromLoose(obj: Record<string, unknown>): {
  barcode: string | null;
  stockCode: string | null;
  productMainId: string | null;
} {
  let barcode = asTrimmedString(obj.barcode);
  const product = obj.product;
  if (product && typeof product === "object") {
    const p = product as Record<string, unknown>;
    if (!barcode) barcode = asTrimmedString(p.barcode);
    return {
      barcode,
      stockCode: asTrimmedString(p.stockCode),
      productMainId: asTrimmedString(p.productMainId)
    };
  }
  return {
    barcode,
    stockCode: asTrimmedString(obj.stockCode),
    productMainId: asTrimmedString(obj.productMainId)
  };
}

function collectCandidateArrays(root: unknown): unknown[] {
  const out: unknown[] = [];
  if (root == null) return out;
  if (Array.isArray(root)) {
    out.push(root);
    return out;
  }
  if (typeof root !== "object") return out;
  const o = root as Record<string, unknown>;
  const keys = [
    "items",
    "errors",
    "failedItems",
    "failureReasons",
    "results",
    "requestItems",
    "products"
  ];
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) out.push(v);
  }
  return out;
}

function scanItemArraysForStatus(
  data: unknown,
  ctx: ParseTrendyolPublishResponseContext
): { hit: "failed" | "success" | null; message: string | null } {
  const stack: unknown[] = [data];
  const seen = new Set<unknown>();

  while (stack.length) {
    const cur = stack.pop();
    if (cur == null || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    for (const arr of collectCandidateArrays(cur)) {
      if (!Array.isArray(arr)) continue;
      for (const el of arr) {
        if (!el || typeof el !== "object") continue;
        const rec = el as Record<string, unknown>;
        const ids = extractIdentifiersFromLoose(rec);
        const matched = matchesContext(ctx, ids.barcode, ids.stockCode, ids.productMainId);

        const statusRaw = asTrimmedString(rec.status) ?? asTrimmedString(rec.itemStatus);
        const st = statusRaw?.toUpperCase() ?? "";

        let msg: string | null = null;
        if (Array.isArray(rec.failureReasons)) {
          msg = (rec.failureReasons as unknown[])
            .map((x) => (typeof x === "string" ? x : String(x)))
            .filter(Boolean)
            .join(" · ");
        }
        if (!msg) msg = asTrimmedString(rec.message) ?? asTrimmedString(rec.errorMessage);

        if (matched) {
          if (st === "FAILED" || st === "FAIL" || st === "ERROR") {
            return { hit: "failed", message: msg ?? "Trendyol ürün satırı reddedildi." };
          }
          if (st === "SUCCESS" || st === "COMPLETED") {
            return { hit: "success", message: null };
          }
        }

        if (
          !matched &&
          (st === "FAILED" || st === "FAIL") &&
          collectCandidateArrays(rec).length === 0 &&
          msg
        ) {
          // Tek ürünlü istek: bazen barkod satırda yok; yine de kök hata sayılır
          const b = normBarcode(ctx.barcode);
          if (!b) {
            return { hit: "failed", message: msg };
          }
        }
      }
    }

    const rec = cur as Record<string, unknown>;
    for (const v of Object.values(rec)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }

  return { hit: null, message: null };
}

function rootLevelFailureMessage(data: unknown): string | null {
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const msg =
    asTrimmedString(o.message) ??
    asTrimmedString(o.errorMessage) ??
    asTrimmedString(o.exception);
  const successFlag = o.success;
  if (successFlag === false && msg) return msg;
  if (Array.isArray(o.errors) && o.errors.length > 0) {
    const first = o.errors[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      return (
        asTrimmedString((first as Record<string, unknown>).message) ??
        JSON.stringify(first).slice(0, 500)
      );
    }
  }
  return msg;
}

function safeRawSnippet(data: unknown, max = 1200): string {
  try {
    const s = JSON.stringify(data);
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  } catch {
    return "[unserializable]";
  }
}

/**
 * Trendyol ürün oluşturma / güncelleme (POST) anında dönen gövdeyi tek ürün için normalize eder.
 * HTTP 200 olsa da tüm ürünleri SUCCESS saymaz; batch kuyruğu için PENDING kullanır.
 */
export function parseTrendyolPublishResponse(
  input: ParseTrendyolPublishResponseInput
): PublishItemResult {
  const { context: ctx } = input;
  const base = {
    productId: ctx.productId,
    mappingId: ctx.mappingId,
    barcode: normBarcode(ctx.barcode) ?? undefined
  };

  if (!input.httpOk) {
    const msg =
      input.httpMessage?.trim() ||
      `Trendyol isteği başarısız (HTTP ${input.httpStatus}).`;
    return {
      ...base,
      status: "FAILED" as const,
      errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_REQUEST_FAILED,
      errorMessage: msg,
      rawMessage: safeRawSnippet({ status: input.httpStatus, message: input.httpMessage })
    };
  }

  const data = input.data;
  if (data == null || (typeof data !== "object" && typeof data !== "string")) {
    return {
      ...base,
      status: "FAILED",
      errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_RESPONSE_UNPARSEABLE,
      errorMessage: "Trendyol yanıtı okunamadı veya boş.",
      rawMessage: safeRawSnippet(data)
    };
  }

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) {
      return {
        ...base,
        status: "FAILED",
        errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_RESPONSE_UNPARSEABLE,
        errorMessage: "Trendyol düz metin yanıt döndü; işlem sonucu çıkarılamadı.",
        rawMessage: trimmed.slice(0, 500)
      };
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return parseTrendyolPublishResponse({ ...input, data: parsed });
    } catch {
      return {
        ...base,
        status: "FAILED",
        errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_RESPONSE_UNPARSEABLE,
        errorMessage: "Geçersiz JSON yanıtı.",
        rawMessage: trimmed.slice(0, 500)
      };
    }
  }

  const rootFail = rootLevelFailureMessage(data);
  const batchRequestId = extractBatchRequestId(data);

  const scan = scanItemArraysForStatus(data, ctx);
  if (scan.hit === "failed") {
    return {
      ...base,
      status: "FAILED",
      errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_ITEM_FAILED,
      errorMessage: scan.message ?? rootFail ?? "Trendyol ürün satırı başarısız.",
      batchRequestId: batchRequestId ?? undefined,
      rawMessage: safeRawSnippet(data)
    };
  }

  if (scan.hit === "success") {
    return {
      ...base,
      status: "SUCCESS",
      errorCode: undefined,
      errorMessage: undefined,
      batchRequestId: batchRequestId ?? undefined,
      rawMessage: safeRawSnippet(data)
    };
  }

  if (rootFail && !batchRequestId) {
    return {
      ...base,
      status: "FAILED",
      errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_ITEM_FAILED,
      errorMessage: rootFail,
      rawMessage: safeRawSnippet(data)
    };
  }

  if (batchRequestId) {
    return {
      ...base,
      status: "PENDING",
      errorCode: undefined,
      errorMessage: undefined,
      batchRequestId,
      rawMessage: safeRawSnippet(data)
    };
  }

  // HTTP 200 ama batch id yok: belirsiz — güvenli tarafta FAILED (yanlış "yayında" önlenir)
  return {
    ...base,
    status: "FAILED",
    errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_RESPONSE_UNPARSEABLE,
    errorMessage:
      rootFail ??
      "Yanıtta batch kimliği yok; Trendyol tarafında kuyruk oluştuğu doğrulanamadı.",
    rawMessage: safeRawSnippet(data)
  };
}
