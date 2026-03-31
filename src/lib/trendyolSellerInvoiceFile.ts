import { prisma } from "@/lib/prisma";
import { trendyolPostFormData } from "@/lib/trendyolFetch";

/** Trendyol micro export fatura no: 3 alfanumerik + 13 rakam */
export const TRENDYOL_MICRO_INVOICE_NUMBER_PATTERN = /^[A-Za-z0-9]{3}\d{13}$/;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function normalizeInvoiceMime(type: string | undefined, filename: string): string | null {
  const t = (type ?? "").toLowerCase().split(";")[0].trim();
  if (ALLOWED_TYPES.has(t)) return t;
  const low = filename.toLowerCase();
  if (low.endsWith(".pdf")) return "application/pdf";
  if (low.endsWith(".jpg") || low.endsWith(".jpeg")) return "image/jpeg";
  if (low.endsWith(".png")) return "image/png";
  return null;
}

async function getSellerIdForStore(storeId: string): Promise<string | null> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { sellerId: true }
  });
  return conn?.sellerId?.trim() ?? null;
}

/**
 * @see https://developers.trendyol.com/v2.0/reference/uploadinvoicefile
 */
export async function uploadTrendyolSellerInvoiceFile(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  isMicroExport: boolean;
  invoiceNumber?: string;
  /** ms unix */
  invoiceDateTimeMs?: number;
  requestId?: string;
}): Promise<ReturnType<typeof trendyolPostFormData>> {
  const sellerId = await getSellerIdForStore(params.storeId);
  if (!sellerId) {
    return { ok: false, status: 400, message: "Trendyol sellerId bulunamadı." };
  }
  if (params.fileBuffer.length > MAX_BYTES) {
    return { ok: false, status: 400, message: "Dosya 10 MB sınırını aşıyor." };
  }
  if (!ALLOWED_TYPES.has(params.mimeType)) {
    return {
      ok: false,
      status: 400,
      message: "Sadece PDF, JPEG veya PNG kabul edilir."
    };
  }

  if (params.isMicroExport) {
    const num = params.invoiceNumber?.trim() ?? "";
    if (!TRENDYOL_MICRO_INVOICE_NUMBER_PATTERN.test(num)) {
      return {
        ok: false,
        status: 400,
        message:
          "Micro ihracat siparişlerinde fatura numarası 16 karakter olmalı (3 harf/rakam + 13 rakam)."
      };
    }
    const ts = params.invoiceDateTimeMs;
    if (ts == null || !Number.isFinite(ts) || ts <= 0) {
      return {
        ok: false,
        status: 400,
        message: "Micro ihracat için geçerli fatura tarihi (timestamp ms) gerekli."
      };
    }
  }

  const form = new FormData();
  form.set("shipmentPackageId", params.shipmentPackageId);
  if (params.isMicroExport) {
    form.set("invoiceNumber", params.invoiceNumber!.trim());
    form.set("invoiceDateTime", String(Math.trunc(params.invoiceDateTimeMs!)));
  }

  const blob = new Blob([new Uint8Array(params.fileBuffer)], { type: params.mimeType });
  form.append("file", blob, params.filename || "invoice.pdf");

  const path = `/integration/sellers/${sellerId}/seller-invoice-file`;
  return trendyolPostFormData(params.userId, params.storeId, path, form, {
    requestId: params.requestId,
    timeoutMs: 120_000
  });
}
