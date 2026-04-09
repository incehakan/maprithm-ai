import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { secureMarketplaceOrderUpdateMany } from "@/lib/security/storeScope";
import { sendInvoiceLinkForPackage } from "@/lib/trendyolOrderActions";

export type InvoiceLinkPayload = {
  invoiceLink: string;
  invoiceNumber: string;
  invoiceDateTime: string;
};

export type ValidateInvoiceResult =
  | { ok: true; payload: InvoiceLinkPayload }
  | { ok: false; error: string };

function isLikelyHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateInvoicePayload(body: unknown): ValidateInvoiceResult {
  if (body == null || typeof body !== "object") {
    return { ok: false, error: "Geçersiz istek gövdesi." };
  }
  const o = body as Record<string, unknown>;
  const invoiceLink = typeof o.invoiceLink === "string" ? o.invoiceLink.trim() : "";
  const invoiceNumber = typeof o.invoiceNumber === "string" ? o.invoiceNumber.trim() : "";

  if (!invoiceLink) {
    return { ok: false, error: "Fatura linki zorunludur." };
  }
  if (!isLikelyHttpUrl(invoiceLink)) {
    return { ok: false, error: "Fatura linki geçerli bir http(s) adresi olmalıdır." };
  }
  if (!invoiceNumber) {
    return { ok: false, error: "Fatura numarası zorunludur." };
  }
  if (invoiceNumber.length > 200) {
    return { ok: false, error: "Fatura numarası çok uzun." };
  }

  let invoiceDateTime: string;
  if (typeof o.invoiceDateTime === "string" && o.invoiceDateTime.trim() !== "") {
    const d = new Date(o.invoiceDateTime);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Fatura tarihi geçersiz (ISO 8601 beklenir)." };
    }
    invoiceDateTime = d.toISOString();
  } else {
    invoiceDateTime = new Date().toISOString();
  }

  return {
    ok: true,
    payload: { invoiceLink, invoiceNumber, invoiceDateTime }
  };
}

export async function sendInvoiceLinkToTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  payload: InvoiceLinkPayload;
}): Promise<{ trendyolData: unknown }> {
  return sendInvoiceLinkForPackage(
    params.userId,
    params.storeId,
    params.shipmentPackageId,
    params.payload
  );
}

export async function markInvoiceStatusOnOrder(params: {
  orderId: string;
  storeId: string;
  data: {
    invoiceLink: string;
    invoiceNumber: string;
    invoiceDateTime: Date;
    invoiceSentAt: Date;
    invoiceStatus: string;
    invoiceLastErrorMessage?: string | null;
    invoiceRawData?: Prisma.InputJsonValue | null;
  };
}) {
  return secureMarketplaceOrderUpdateMany(params.orderId, params.storeId, {
    invoiceLink: params.data.invoiceLink,
    invoiceNumber: params.data.invoiceNumber,
    invoiceDateTime: params.data.invoiceDateTime,
    invoiceSentAt: params.data.invoiceSentAt,
    invoiceStatus: params.data.invoiceStatus,
    invoiceLastErrorMessage: params.data.invoiceLastErrorMessage ?? null,
    invoiceRawData:
      params.data.invoiceRawData === undefined
        ? undefined
        : (params.data.invoiceRawData as Prisma.InputJsonValue),
    lastFetchedAt: new Date(),
    lastIngestSource: "operation"
  });
}
