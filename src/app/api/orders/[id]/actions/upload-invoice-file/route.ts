import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { createActivityLog } from "@/lib/activityLog";
import { getRequestId } from "@/lib/requestContext";
import { logger } from "@/lib/logger";
import {
  normalizeInvoiceMime,
  uploadTrendyolSellerInvoiceFile
} from "@/lib/trendyolSellerInvoiceFile";

type Params = { params: { id: string } };

const PLACEHOLDER_FILE_LINK = "trendyol:seller-invoice-file";

export async function POST(request: Request, { params }: Params) {
  const requestId = getRequestId(request);
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg, requestId }, { status: 401 });
  }
  try {
    requirePermission(ctx, "orders.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok.", requestId }, { status: 403 });
  }

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: params.id, storeId: ctx.storeId, isTestRecord: false },
    select: {
      id: true,
      shipmentPackageId: true,
      invoiceLink: true,
      invoiceNumber: true,
      invoiceDateTime: true,
      invoiceStatus: true,
      rawData: true
    }
  });
  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı.", requestId }, { status: 404 });
  }

  const raw = order.rawData as Record<string, unknown> | null;
  const microFromOrder = raw?.micro === true;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "multipart/form-data bekleniyor.", requestId },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { success: false, error: "Geçerli bir dosya seçin.", requestId },
      { status: 400 }
    );
  }

  const shipmentField = form.get("shipmentPackageId");
  const bodyPkg =
    typeof shipmentField === "string" ? shipmentField.trim() : String(shipmentField ?? "");
  if (!bodyPkg || bodyPkg !== order.shipmentPackageId) {
    return NextResponse.json(
      {
        success: false,
        error: "shipmentPackageId bu sipariş paketi ile eşleşmelidir.",
        requestId
      },
      { status: 400 }
    );
  }

  const microField = form.get("isMicroExport");
  const isMicroExport =
    microFromOrder ||
    microField === "true" ||
    microField === "1" ||
    String(microField ?? "").toLowerCase() === "on";

  const invoiceNumberField = form.get("invoiceNumber");
  const invoiceNumber =
    typeof invoiceNumberField === "string" ? invoiceNumberField.trim() : "";
  const invoiceDateField = form.get("invoiceDateTime");
  let invoiceDateTimeMs: number | undefined;
  if (typeof invoiceDateField === "string" && invoiceDateField.trim()) {
    const d = new Date(invoiceDateField);
    if (!Number.isNaN(d.getTime())) invoiceDateTimeMs = d.getTime();
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = normalizeInvoiceMime(file.type, file.name);
  if (!mime) {
    return NextResponse.json(
      { success: false, error: "Dosya türü: yalnızca PDF, JPEG, PNG.", requestId },
      { status: 400 }
    );
  }

  const now = new Date();
  const prevStatus = order.invoiceStatus ?? null;

  const result = await uploadTrendyolSellerInvoiceFile({
    userId: ctx.userId,
    storeId: ctx.storeId,
    shipmentPackageId: order.shipmentPackageId,
    fileBuffer: buf,
    filename: file.name || "invoice.pdf",
    mimeType: mime,
    isMicroExport,
    invoiceNumber: isMicroExport ? invoiceNumber : undefined,
    invoiceDateTimeMs: isMicroExport ? invoiceDateTimeMs : undefined,
    requestId
  });

  if (!result.ok) {
    logger.error("trendyol_invoice_file_failed", {
      route: "/api/orders/[id]/actions/upload-invoice-file",
      requestId,
      storeId: ctx.storeId,
      orderId: order.id,
      shipmentPackageId: order.shipmentPackageId,
      error: result.message
    });
    await prisma.marketplaceOrder.update({
      where: { id: order.id, storeId: ctx.storeId },
      data: {
        invoiceStatus: "failed",
        invoiceLastErrorMessage: result.message.slice(0, 2000),
        invoiceRawData: {
          invoiceFileUploadError: result.message,
          at: now.toISOString()
        } as Prisma.InputJsonValue,
        lastFetchedAt: now
      }
    });
    await prisma.marketplaceOrderInvoice.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        shipmentPackageId: order.shipmentPackageId,
        invoiceNumber: invoiceNumber || order.invoiceNumber,
        invoiceDateTime: invoiceDateTimeMs
          ? new Date(invoiceDateTimeMs)
          : order.invoiceDateTime,
        invoiceLink: order.invoiceLink ?? PLACEHOLDER_FILE_LINK,
        invoiceStatus: "failed",
        lastErrorMessage: result.message.slice(0, 2000),
        rawData: { upload: "seller-invoice-file", error: result.message } as Prisma.InputJsonValue
      }
    });
    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        action: "INVOICE_FILE_FAILED",
        message: result.message.slice(0, 500),
        previousStatus: prevStatus,
        nextStatus: "failed",
        relatedShipmentPackageId: order.shipmentPackageId,
        rawData: { requestId } as Prisma.InputJsonValue
      }
    });
    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_INVOICE_FILE_FAILED",
      entityType: "marketplace_order",
      entityId: order.id,
      message: `${order.shipmentPackageId}: ${result.message.slice(0, 400)}`
    });
    return NextResponse.json(
      { success: false, error: result.message, requestId },
      { status: result.status >= 400 ? result.status : 502 }
    );
  }

  const invDate =
    isMicroExport && invoiceDateTimeMs
      ? new Date(invoiceDateTimeMs)
      : order.invoiceDateTime ?? now;
  const invNum = isMicroExport
    ? invoiceNumber || order.invoiceNumber
    : order.invoiceNumber;
  const linkKeep = order.invoiceLink ?? PLACEHOLDER_FILE_LINK;

  await prisma.marketplaceOrder.update({
    where: { id: order.id, storeId: ctx.storeId },
    data: {
      invoiceLink: linkKeep,
      invoiceNumber: invNum,
      invoiceDateTime: invDate,
      invoiceSentAt: now,
      invoiceStatus: "sent",
      invoiceLastErrorMessage: null,
      invoiceRawData: {
        sellerInvoiceFile: true,
        trendyolResponse: result.data,
        at: now.toISOString()
      } as Prisma.InputJsonValue,
      lastFetchedAt: now,
      lastIngestSource: "operation"
    }
  });

  await prisma.marketplaceOrderInvoice.create({
    data: {
      storeId: ctx.storeId,
      orderId: order.id,
      shipmentPackageId: order.shipmentPackageId,
      invoiceNumber: invNum,
      invoiceDateTime: invDate,
      invoiceLink: linkKeep,
      invoiceStatus: "sent",
      rawData: {
        upload: "seller-invoice-file",
        response: result.data
      } as Prisma.InputJsonValue
    }
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId: ctx.storeId,
      orderId: order.id,
      action: "INVOICE_FILE_SENT",
      message: "Fatura dosyası Trendyol seller-invoice-file API ile yüklendi.",
      previousStatus: prevStatus,
      nextStatus: "sent",
      relatedShipmentPackageId: order.shipmentPackageId,
      rawData: { requestId, micro: isMicroExport } as Prisma.InputJsonValue
    }
  });

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "TRENDYOL_INVOICE_FILE_SENT",
    entityType: "marketplace_order",
    entityId: order.id,
    message: `Dosya yükleme: ${order.shipmentPackageId}`
  });

  return NextResponse.json({
    success: true,
    invoiceStatus: "sent",
    requestId,
    data: result.data
  });
}
