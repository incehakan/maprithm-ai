/**
 * Uygulama genelinde tek tip hata kodları (API + log + UI resolver ile uyumlu).
 * Domain özel kodları (Trendyol ön-yayın / çalışma zamanı) burada da listelenir;
 * ayrıntılı sabitler için bkz. `validation/trendyolPublishErrorCodes.ts` (string değerleri aynı kalır).
 */

export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NO_ACTIVE_STORE"
  | "STORE_SCOPE_MISMATCH"
  | "TRENDYOL_CATEGORY_MISSING"
  | "TRENDYOL_BRAND_MISSING"
  | "TRENDYOL_ATTRIBUTE_MISSING"
  | "TRENDYOL_INVALID_PRICE"
  | "TRENDYOL_INVALID_STOCK"
  | "TRENDYOL_CARGO_MISSING"
  | "TRENDYOL_PUBLISH_REQUEST_FAILED"
  | "TRENDYOL_PUBLISH_RESPONSE_UNPARSEABLE"
  | "IMPORT_FILE_INVALID"
  | "XML_SYNC_FAILED"
  | "MARKETPLACE_SYNC_FAILED"
  | "INTERNAL_ERROR"
  /** `trendyolPublishErrorCodes` ile hizalı ek kodlar */
  | "STORE_CONTEXT_INVALID"
  | "TRENDYOL_CONNECTION_MISSING"
  | "TRENDYOL_CONNECTION_INACTIVE"
  | "TRENDYOL_SELLER_ID_MISSING"
  | "TRENDYOL_MAPPING_MISSING"
  | "TRENDYOL_IMAGE_MISSING"
  | "TRENDYOL_LIST_PRICE_INVALID"
  | "TRENDYOL_ADDRESSES_MISSING"
  | "TRENDYOL_PUBLISH_ITEM_FAILED"
  | "TRENDYOL_PUBLISH_VALIDATION_FAILED"
  | "TRENDYOL_PUBLISH_GATE_BLOCKED"
  | "TRENDYOL_INVALID_BARCODE"
  | "TRENDYOL_CARGO_INVALID"
  | "TRENDYOL_PUBLISH_PAYLOAD_BUILD_FAILED"
  | "TRENDYOL_PUBLISH_BARCODE_MATCH_FAILED"
  | "TRENDYOL_BARCODE_MISSING"
  | "TRENDYOL_STOCK_CODE_MISSING";

export type AppErrorSeverity = "info" | "warning" | "error" | "critical";

export type AppErrorShape = {
  code: AppErrorCode;
  userMessage: string;
  internalMessage?: string;
  field?: string;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly internalMessage?: string;
  readonly httpStatus: number;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  readonly severity?: AppErrorSeverity;

  constructor(params: {
    code: AppErrorCode;
    userMessage: string;
    httpStatus: number;
    internalMessage?: string;
    field?: string;
    details?: Record<string, unknown>;
    severity?: AppErrorSeverity;
  }) {
    super(params.internalMessage ?? params.userMessage);
    this.name = "AppError";
    this.code = params.code;
    this.userMessage = params.userMessage;
    this.internalMessage = params.internalMessage;
    this.httpStatus = params.httpStatus;
    this.field = params.field;
    this.details = params.details;
    this.severity = params.severity;
  }

  toJSON(): AppErrorShape {
    const o: AppErrorShape = {
      code: this.code,
      userMessage: this.userMessage
    };
    if (this.field) o.field = this.field;
    if (this.details && Object.keys(this.details).length > 0) o.details = this.details;
    return o;
  }
}
