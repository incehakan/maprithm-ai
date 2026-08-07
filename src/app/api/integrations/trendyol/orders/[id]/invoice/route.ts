import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { createActivityLog } from "@/lib/activityLog";
import {
  markInvoiceStatusOnOrder,
  sendInvoiceLinkToTrendyol,
  validateInvoicePayload
} from "@/lib/trendyolInvoice";
import { logger } from "@/lib/logger";
import { secureMarketplaceOrderUpdateMany } from "@/lib/security/storeScope";

type Params = { params: { id: string } };

/**
 * Fatura linki gönderimi — MarketplaceOrder + MarketplaceOrderInvoice.
 * `id`: sipariş UUID veya shipmentPackageId.
 * Asıl panel yolu: /api/orders/[id]/actions/send-invoice-link
 */
export async function POST(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "orders.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const idOrPkg = params.id?.trim();
  if (!idOrPkg) {
    return NextResponse.json({ success: false, error: "Sipariş kimliği gerekli." }, { status: 400 });
  }

  const order = await prisma.marketplaceOrder.findFirst({
    where: {
      storeId: ctx.storeId,
      platform: "trendyol",
      isTestRecord: false,
      OR: [{ id: idOrPkg }, { shipmentPackageId: idOrPkg }]
    },
    select: {
      id: true,
      shipmentPackageId: true,
      invoiceSentAt: true,
      invoiceStatus: true
    }
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
  }

  const rawBody = await request.json().catch(() => null);
  const bodyObj =
    rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>) : null;

  const bodyShipmentId =
    bodyObj && typeof bodyObj.shipmentPackageId === "string"
      ? bodyObj.shipmentPackageId.trim()
      : null;

  if (bodyShipmentId && bodyShipmentId !== order.shipmentPackageId) {
    return NextResponse.json(
      {
        success: false,
        error: "shipmentPackageId bu sipariş paketi ile eşleşmelidir."
      },
      { status: 400 }
    );
  }

  const validated = validateInvoicePayload(rawBody);
  if (!validated.ok) {
    return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
  }

  const { payload } = validated;
  const isResend = order.invoiceSentAt != null;
  const prevInvoiceStatus = order.invoiceStatus ?? null;
  const now = new Date();
  const invoiceDate = new Date(payload.invoiceDateTime);

  try {
    const result = await sendInvoiceLinkToTrendyol({
      userId: ctx.userId,
      storeId: ctx.storeId,
      shipmentPackageId: order.shipmentPackageId,
      payload
    });

    await markInvoiceStatusOnOrder({
      orderId: order.id,
      storeId: ctx.storeId,
      data: {
        invoiceLink: payload.invoiceLink,
        invoiceNumber: payload.invoiceNumber,
        invoiceDateTime: invoiceDate,
        invoiceSentAt: now,
        invoiceStatus: "sent",
        invoiceLastErrorMessage: null,
        invoiceRawData: (result.trendyolData ?? Prisma.JsonNull) as Prisma.InputJsonValue
      }
    });

    await prisma.marketplaceOrderInvoice.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        shipmentPackageId: order.shipmentPackageId,
        invoiceNumber: payload.invoiceNumber,
        invoiceDateTime: invoiceDate,
        invoiceLink: payload.invoiceLink,
        invoiceStatus: "sent",
        rawData: (result.trendyolData ?? Prisma.JsonNull) as Prisma.InputJsonValue
      }
    });

    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        action: isResend ? "INVOICE_LINK_RESENT" : "INVOICE_LINK_SENT",
        message: isResend
          ? "Fatura linki yeniden Trendyol'a gönderildi."
          : "Fatura linki Trendyol'a gönderildi.",
        previousStatus: prevInvoiceStatus,
        nextStatus: "sent",
        relatedShipmentPackageId: order.shipmentPackageId,
        rawData: {
          invoiceNumber: payload.invoiceNumber,
          isResend,
          via: "integrations/trendyol/orders/invoice"
        } as Prisma.InputJsonValue
      }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: isResend ? "TRENDYOL_INVOICE_LINK_RESENT" : "TRENDYOL_INVOICE_LINK_SENT",
      entityType: "marketplace_order",
      entityId: order.id,
      message: `${isResend ? "Yeniden gönderim" : "Gönderim"}: ${order.shipmentPackageId} / ${payload.invoiceNumber}`
    });

    return NextResponse.json({
      success: true,
      invoiceStatus: "sent",
      isResend,
      orderId: order.id
    });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "Fatura linki Trendyol tarafına iletilemedi. Bağlantıyı kontrol edin.";

    logger.error("integrations_trendyol_invoice_failed", {
      storeId: ctx.storeId,
      orderId: order.id,
      shipmentPackageId: order.shipmentPackageId,
      error: msg
    });

    await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
      invoiceStatus: "failed",
      invoiceLastErrorMessage: msg,
      invoiceRawData: { error: msg, at: now.toISOString() } as Prisma.InputJsonValue,
      lastFetchedAt: now
    });

    await prisma.marketplaceOrderInvoice.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        shipmentPackageId: order.shipmentPackageId,
        invoiceNumber: payload.invoiceNumber,
        invoiceDateTime: invoiceDate,
        invoiceLink: payload.invoiceLink,
        invoiceStatus: "failed",
        lastErrorMessage: msg,
        rawData: { error: msg } as Prisma.InputJsonValue
      }
    });

    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
