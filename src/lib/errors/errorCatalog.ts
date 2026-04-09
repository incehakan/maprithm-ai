import type { AppErrorCode, AppErrorSeverity } from "./appError";

export type ErrorCatalogEntry = {
  userMessage: string;
  httpStatus: number;
  severity: AppErrorSeverity;
};

/** Varsayılan HTTP ve Türkçe kullanıcı mesajı; route içinde `userMessage` override edilebilir. */
export const ERROR_CATALOG: Record<AppErrorCode, ErrorCatalogEntry> = {
  VALIDATION_ERROR: {
    userMessage: "Girdiğiniz bilgiler geçerli değil. Lütfen kontrol edip tekrar deneyin.",
    httpStatus: 400,
    severity: "warning"
  },
  NOT_FOUND: {
    userMessage: "İstenen kayıt bulunamadı.",
    httpStatus: 404,
    severity: "info"
  },
  UNAUTHORIZED: {
    userMessage: "Oturum açmanız veya yetkiniz olması gerekiyor.",
    httpStatus: 401,
    severity: "warning"
  },
  FORBIDDEN: {
    userMessage: "Bu işlem için yetkiniz yok.",
    httpStatus: 403,
    severity: "warning"
  },
  NO_ACTIVE_STORE: {
    userMessage: "Devam etmek için bir mağaza seçin.",
    httpStatus: 401,
    severity: "info"
  },
  STORE_SCOPE_MISMATCH: {
    userMessage: "Kayıt bulunamadı.",
    httpStatus: 404,
    severity: "info"
  },
  TRENDYOL_CATEGORY_MISSING: {
    userMessage: "Trendyol kategorisi seçilmedi veya eksik.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_BRAND_MISSING: {
    userMessage: "Trendyol markası seçilmedi veya eksik.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_ATTRIBUTE_MISSING: {
    userMessage: "Trendyol için zorunlu ürün özelliği eksik.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_INVALID_PRICE: {
    userMessage: "Fiyat bilgisi geçersiz veya eksik.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_INVALID_STOCK: {
    userMessage: "Stok bilgisi geçersiz veya eksik.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_CARGO_MISSING: {
    userMessage: "Yayınlama için geçerli bir kargo firması seçilmelidir.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_PUBLISH_REQUEST_FAILED: {
    userMessage: "Trendyol sunucusuna istek gönderilemedi. Bir süre sonra tekrar deneyin.",
    httpStatus: 502,
    severity: "error"
  },
  TRENDYOL_PUBLISH_RESPONSE_UNPARSEABLE: {
    userMessage: "Trendyol yanıtı işlenemedi. Sorun devam ederse destek ile iletişime geçin.",
    httpStatus: 502,
    severity: "error"
  },
  IMPORT_FILE_INVALID: {
    userMessage: "Yüklenen dosya okunamadı veya format desteklenmiyor.",
    httpStatus: 400,
    severity: "warning"
  },
  XML_SYNC_FAILED: {
    userMessage: "XML senkron işlemi tamamlanamadı.",
    httpStatus: 502,
    severity: "error"
  },
  MARKETPLACE_SYNC_FAILED: {
    userMessage: "Pazaryeri senkron işlemi tamamlanamadı.",
    httpStatus: 502,
    severity: "error"
  },
  INTERNAL_ERROR: {
    userMessage: "İşlem sırasında beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
    httpStatus: 500,
    severity: "critical"
  },

  STORE_CONTEXT_INVALID: {
    userMessage: "Oturum veya mağaza bilgisi eksik. Sayfayı yenileyip tekrar deneyin.",
    httpStatus: 401,
    severity: "warning"
  },
  TRENDYOL_CONNECTION_MISSING: {
    userMessage: "Trendyol bağlantısı tanımlı değil. Ayarlardan bağlantı oluşturun.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_CONNECTION_INACTIVE: {
    userMessage: "Trendyol bağlantısı kapalı. Entegrasyon ayarlarından etkinleştirin.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_SELLER_ID_MISSING: {
    userMessage: "Satıcı kimliği (Seller ID) tanımlı değil.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_MAPPING_MISSING: {
    userMessage: "Bu ürün için Trendyol eşleştirmesi bulunamadı.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_IMAGE_MISSING: {
    userMessage: "Yayın için ürün görseli gerekiyor.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_LIST_PRICE_INVALID: {
    userMessage: "Liste fiyatı geçersiz.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_ADDRESSES_MISSING: {
    userMessage: "Trendyol gönderim veya iade adresi tanımlı değil.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_PUBLISH_ITEM_FAILED: {
    userMessage: "Trendyol bu ürün kaydını kabul etmedi. Ayrıntılar için mesajı inceleyin.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_PUBLISH_VALIDATION_FAILED: {
    userMessage: "Yayın öncesi zorunlu alanlar eksik veya geçersiz.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_PUBLISH_GATE_BLOCKED: {
    userMessage: "Ürün durumu veya iş kuralı nedeniyle gönderim yapılamıyor.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_INVALID_BARCODE: {
    userMessage: "Barkod geçersiz veya Trendyol ile çakışıyor.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_CARGO_INVALID: {
    userMessage: "Kargo seçimi geçersiz veya anlaşma bulunamadı.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_PUBLISH_PAYLOAD_BUILD_FAILED: {
    userMessage: "Gönderilecek ürün verisi oluşturulamadı.",
    httpStatus: 400,
    severity: "error"
  },
  TRENDYOL_PUBLISH_BARCODE_MATCH_FAILED: {
    userMessage: "İşlem sonucunda barkod eşleşmesi yapılamadı.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_BARCODE_MISSING: {
    userMessage: "Barkod tanımlı değil.",
    httpStatus: 400,
    severity: "warning"
  },
  TRENDYOL_STOCK_CODE_MISSING: {
    userMessage: "Stok kodu tanımlı değil.",
    httpStatus: 400,
    severity: "warning"
  }
};

export function getCatalogEntry(code: AppErrorCode): ErrorCatalogEntry {
  return ERROR_CATALOG[code];
}

/**
 * Trendyol domain string kodlarını (pre-publish / runtime) AppErrorCode'a düşürür.
 * Eşleşmezse VALIDATION_ERROR.
 */
export function normalizeTrendyolDomainCode(code: string | undefined | null): AppErrorCode {
  if (!code || typeof code !== "string") return "VALIDATION_ERROR";
  if (code in ERROR_CATALOG) return code as AppErrorCode;
  return "VALIDATION_ERROR";
}
