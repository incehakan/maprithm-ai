import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { secureMarketplaceOrderUpdateMany } from "@/lib/security/storeScope";
import {
  buildTrackingLink,
  resolveCargoProviderDisplay
} from "@/lib/trendyolTracking";
import { normalizePackageStatusKey } from "@/lib/orderLifecycle";
import { randomUUID } from "crypto";

export type TestLabCreateOrderLine = {
  stockCode?: string | null;
  barcode?: string | null;
  productName?: string | null;
  quantity: number;
  lineUnitPrice?: number | null;
};

export type TestLabCreateOrderInput = {
  storeId: string;
  testSource: string;
  orderNumber: string;
  shipmentPackageId: string;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  packageStatus?: string | null;
  totalPrice?: number | null;
  currency?: string;
  cargoProviderName?: string | null;
  cargoProviderCode?: string | null;
  cargoTrackingNumber?: string | null;
  cargoSenderNumber?: string | null;
  lines: TestLabCreateOrderLine[];
};

export async function getMembershipIdForUserStore(
  userId: string,
  storeId: string
): Promise<string | null> {
  const row = await prisma.storeMembership.findFirst({
    where: { userId, storeId, isActive: true },
    select: { id: true }
  });
  return row?.id ?? null;
}

function mustNonEmpty(s: unknown, label: string): string {
  if (typeof s !== "string") throw new Error(`${label} gerekli.`);
  const v = s.trim();
  if (!v) throw new Error(`${label} gerekli.`);
  return v;
}

export async function createTestOrder(params: {
  userId: string;
  storeId: string;
  testSource: string;
  input: TestLabCreateOrderInput;
}): Promise<{
  orderId: string;
  shipmentPackageId: string;
}> {
  const { userId, storeId, testSource, input } = params;

  const orderNumber = mustNonEmpty(input.orderNumber, "orderNumber");
  const shipmentPackageId = mustNonEmpty(
    input.shipmentPackageId,
    "shipmentPackageId"
  );

  const exists = await prisma.marketplaceOrder.findFirst({
    where: {
      storeId,
      platform: "trendyol",
      shipmentPackageId,
      isTestRecord: true,
      testSource
    },
    select: { id: true }
  });
  if (exists) {
    throw new Error("Bu test shipmentPackageId daha önce oluşturulmuş.");
  }

  // Çakışma riskini azaltmak için gerçek record ile çakışmasın.
  const collision = await prisma.marketplaceOrder.findFirst({
    where: {
      storeId,
      platform: "trendyol",
      shipmentPackageId,
      isTestRecord: false
    },
    select: { id: true }
  });
  if (collision) {
    throw new Error(
      "Bu shipmentPackageId gerçek veriyle çakışıyor. Farklı bir paket id verin."
    );
  }

  const shipmentPackageStatus = normalizePackageStatusKey(
    input.packageStatus ?? "Created"
  );
  const packageStatus = shipmentPackageStatus ?? "Created";
  const now = new Date();

  const cargoProviderName = input.cargoProviderName?.trim() ?? null;
  const cargoProviderCode = input.cargoProviderCode?.trim() ?? null;
  const cargoTrackingNumber = input.cargoTrackingNumber?.trim() ?? null;
  const cargoSenderNumber = input.cargoSenderNumber?.trim() ?? null;

  const cargoTrackingLink =
    cargoTrackingNumber && cargoProviderName
      ? buildTrackingLink(cargoTrackingNumber, cargoProviderCode, cargoProviderName)
      : null;

  const membershipId = await getMembershipIdForUserStore(userId, storeId);

  const orderRow = await prisma.marketplaceOrder.create({
    data: {
      storeId,
      platform: "trendyol",
      orderNumber,
      rootOrderNumber: orderNumber,
      orderDate: now,
      shipmentPackageId,
      parentShipmentPackageId: null,
      packageStatus,
      packageStatusUpdatedAt: now,
      cargoTrackingNumber,
      cargoTrackingLink: cargoTrackingLink ?? undefined,
      cargoProviderName,
      cargoProviderCode: cargoProviderCode ?? undefined,
      cargoSenderNumber: cargoSenderNumber ?? undefined,
      cargoStatusText: null,
      cargoLastEventAt: null,
      cargoLastEventMessage: null,
      trackingRawData: Prisma.JsonNull,
      trackingUpdatedAt: undefined,
      cargoProviderChangedAt: undefined,
      labelFetchedAt: undefined,
      cargoLabelUrl: null,
      cargoLabelRawData: Prisma.JsonNull,
      shippingOperationStatus: null,
      shippingOperationLastErrorMessage: null,
      isTestRecord: true,
      testSource,
      sandboxMode: true,
      customerId: null,
      deliveryAddressType: null,
      customerFirstName: input.customerFirstName?.trim() ?? null,
      customerLastName: input.customerLastName?.trim() ?? null,
      customerEmailMasked: null,
      customerPhoneMasked: null,
      totalPrice: input.totalPrice ?? null,
      currency: input.currency ?? "TRY",
      invoiceAddress: Prisma.JsonNull,
      shipmentAddress: Prisma.JsonNull,
      rawData: { test: true, note: "Created by test-lab" } as unknown as Prisma.JsonObject,
      lastFetchedAt: now,
      lastIngestSource: "operation"
    },
    select: { id: true, shipmentPackageId: true }
  });

  await prisma.marketplaceOrderLine.createMany({
    data: input.lines.map((l) => ({
      storeId,
      orderId: orderRow.id,
      lineId: l.stockCode?.trim() ?? undefined,
      barcode: l.barcode?.trim() ?? undefined,
      stockCode: l.stockCode?.trim() ?? undefined,
      productName: l.productName?.trim() ?? undefined,
      quantity: Math.max(1, Math.floor(l.quantity)),
      lineUnitPrice:
        l.lineUnitPrice == null ? undefined : Number.isFinite(l.lineUnitPrice) ? l.lineUnitPrice : undefined,
      rawData: Prisma.JsonNull,
      isTestRecord: true,
      testSource
    }))
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: orderRow.id,
      action: "TEST_ORDER_CREATED",
      message: `Test order oluşturuldu (${orderNumber}).`,
      previousStatus: null,
      nextStatus: packageStatus,
      relatedShipmentPackageId: shipmentPackageId,
      rawData: { packageStatus } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: orderRow.id,
      action: "PACKAGE_STATUS_CHANGED",
      message: `Paket durumu test ile set edildi: ${packageStatus}`,
      previousStatus: null,
      nextStatus: packageStatus,
      relatedShipmentPackageId: shipmentPackageId,
      rawData: Prisma.JsonNull,
      isTestRecord: true,
      testSource
    }
  });

  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TEST_ORDER_CREATED",
    entityType: "marketplace_order",
    entityId: orderRow.id,
    message: `Test order created [run:${testSource}]`
  });

  return { orderId: orderRow.id, shipmentPackageId };
}

export async function simulateTestLifecycle(params: {
  userId: string;
  storeId: string;
  testSource: string;
  orderId: string;
  nextStatus: string;
}): Promise<{
  previousStatus: string | null;
  nextStatus: string;
}> {
  const { userId, storeId, testSource, orderId, nextStatus } = params;
  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, storeId, isTestRecord: true, testSource }
  });
  if (!order) throw new Error("Test order bulunamadı.");

  const normalizedNext = normalizePackageStatusKey(nextStatus) ?? nextStatus;
  const prev = order.packageStatus;
  const now = new Date();

  await secureMarketplaceOrderUpdateMany(order.id, storeId, {
    packageStatus: normalizedNext,
    packageStatusUpdatedAt: now,
    lastFetchedAt: now
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: order.id,
      action: "PACKAGE_STATUS_CHANGED",
      message: `Test lifecycle: ${prev ?? "—"} → ${normalizedNext}`,
      previousStatus: prev,
      nextStatus: normalizedNext,
      relatedShipmentPackageId: order.shipmentPackageId,
      rawData: Prisma.JsonNull,
      isTestRecord: true,
      testSource
    }
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: order.id,
      action: "TEST_PACKAGE_LIFECYCLE_SIMULATED",
      message: `Lifecycle simüle edildi: ${normalizedNext}`,
      previousStatus: prev,
      nextStatus: normalizedNext,
      relatedShipmentPackageId: order.shipmentPackageId,
      rawData: { prev, next: normalizedNext } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  const membershipId = await getMembershipIdForUserStore(userId, storeId);
  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TEST_PACKAGE_LIFECYCLE_SIMULATED",
    entityType: "marketplace_order",
    entityId: order.id,
    message: `Lifecycle simulated [run:${testSource}] → ${normalizedNext}`
  });

  return { previousStatus: prev, nextStatus: normalizedNext };
}

export async function createTestSplitPackage(params: {
  userId: string;
  storeId: string;
  testSource: string;
  parentOrderId: string;
  childShipmentPackageId: string;
  moveLineCount: number;
}): Promise<{
  childOrderId: string;
  childShipmentPackageId: string;
}> {
  const { userId, storeId, testSource, parentOrderId, childShipmentPackageId } = params;
  const parent = await prisma.marketplaceOrder.findFirst({
    where: { id: parentOrderId, storeId, isTestRecord: true, testSource },
    include: { lines: { orderBy: { createdAt: "asc" }, select: { id: true, stockCode: true, barcode: true, productName: true, quantity: true, lineUnitPrice: true, rawData: true, lineId: true } } }
  });
  if (!parent) throw new Error("Parent test order bulunamadı.");

  const existsCollision = await prisma.marketplaceOrder.findFirst({
    where: { storeId, platform: "trendyol", shipmentPackageId: childShipmentPackageId },
    select: { id: true }
  });
  if (existsCollision) throw new Error("childShipmentPackageId çakışıyor.");

  const moveLineCount = Math.max(1, Math.floor(params.moveLineCount));
  const orderedLines = parent.lines;
  if (orderedLines.length === 0) throw new Error("Parent order içinde line yok.");
  const toMove = orderedLines.slice(0, Math.min(moveLineCount, orderedLines.length));

  const now = new Date();

  const membershipId = await getMembershipIdForUserStore(userId, storeId);

  const child = await prisma.marketplaceOrder.create({
    data: {
      storeId,
      platform: "trendyol",
      orderNumber: parent.orderNumber,
      rootOrderNumber: parent.rootOrderNumber,
      orderDate: now,
      shipmentPackageId: childShipmentPackageId,
      parentShipmentPackageId: parent.shipmentPackageId,
      packageStatus: "Created",
      packageStatusUpdatedAt: now,
      isSplitPackage: true,
      splitFromPackageId: parent.id,
      splitDetectedAt: now,
      isTestRecord: true,
      testSource,
      sandboxMode: true,
      cargoTrackingNumber: parent.cargoTrackingNumber,
      cargoTrackingLink: parent.cargoTrackingLink,
      cargoSenderNumber: parent.cargoSenderNumber,
      cargoProviderName: parent.cargoProviderName,
      cargoProviderCode: parent.cargoProviderCode,
      cargoStatusText: parent.cargoStatusText,
      cargoLastEventAt: parent.cargoLastEventAt,
      cargoLastEventMessage: parent.cargoLastEventMessage,
      trackingRawData: parent.trackingRawData as unknown as Prisma.InputJsonValue,
      trackingUpdatedAt: parent.trackingUpdatedAt ?? undefined,
      cargoProviderChangedAt: parent.cargoProviderChangedAt ?? undefined,
      labelFetchedAt: parent.labelFetchedAt ?? undefined,
      cargoLabelUrl: parent.cargoLabelUrl,
      cargoLabelRawData: parent.cargoLabelRawData ?? undefined,
      shippingOperationStatus: parent.shippingOperationStatus ?? undefined,
      shippingOperationLastErrorMessage:
        parent.shippingOperationLastErrorMessage ?? undefined,
      totalPrice: parent.totalPrice,
      currency: parent.currency,
      customerFirstName: parent.customerFirstName,
      customerLastName: parent.customerLastName,
      customerEmailMasked: parent.customerEmailMasked,
      customerPhoneMasked: parent.customerPhoneMasked,
      invoiceAddress:
        parent.invoiceAddress == null
          ? Prisma.JsonNull
          : (parent.invoiceAddress as Prisma.InputJsonValue),
      shipmentAddress:
        parent.shipmentAddress == null
          ? Prisma.JsonNull
          : (parent.shipmentAddress as Prisma.InputJsonValue),
      rawData: { testSplitFrom: parent.id, moveLineCount } as unknown as Prisma.JsonObject,
      lastFetchedAt: now,
      lastIngestSource: "split"
    },
    select: { id: true, shipmentPackageId: true }
  });

  if (toMove.length > 0) {
    await prisma.marketplaceOrderLine.createMany({
      data: toMove.map((l) => ({
        storeId,
        orderId: child.id,
        lineId: l.lineId,
        barcode: l.barcode ?? undefined,
        stockCode: l.stockCode ?? undefined,
        productName: l.productName ?? undefined,
        quantity: l.quantity,
        lineUnitPrice: l.lineUnitPrice ?? undefined,
        rawData: (l.rawData ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        isTestRecord: true,
        testSource
      }))
    });
    await prisma.marketplaceOrderLine.deleteMany({
      where: { id: { in: toMove.map((l) => l.id) } }
    });
  }

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: parent.id,
      action: "TEST_PACKAGE_SPLIT_CREATED",
      message: `Test split oluşturuldu. Child: ${child.id}`,
      previousStatus: parent.packageStatus,
      nextStatus: parent.packageStatus,
      relatedShipmentPackageId: child.shipmentPackageId,
      rawData: { parentShipmentPackageId: parent.shipmentPackageId } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: child.id,
      action: "PACKAGE_STATUS_CHANGED",
      message: "Child paket test ile oluşturuldu.",
      previousStatus: null,
      nextStatus: "Created",
      relatedShipmentPackageId: child.shipmentPackageId,
      rawData: Prisma.JsonNull,
      isTestRecord: true,
      testSource
    }
  });

  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TEST_PACKAGE_SPLIT_CREATED",
    entityType: "marketplace_order",
    entityId: child.id,
    message: `Test split created [run:${testSource}]`
  });

  return { childOrderId: child.id, childShipmentPackageId: child.shipmentPackageId };
}

export async function updateTestTrackingAndLabel(params: {
  userId: string;
  storeId: string;
  testSource: string;
  orderId: string;
  trackingNumber: string;
  providerCode: string;
  providerName: string;
  cargoSenderNumber?: string | null;
  labelUrl?: string | null;
  labelFormat?: string | null;
}): Promise<{ trackingUpdated: boolean; labelUpdated: boolean }> {
  const { userId, storeId, testSource, orderId } = params;
  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, storeId, isTestRecord: true, testSource }
  });
  if (!order) throw new Error("Test order bulunamadı.");

  const now = new Date();
  const membershipId = await getMembershipIdForUserStore(userId, storeId);

  const trackingNumber = mustNonEmpty(params.trackingNumber, "trackingNumber");
  const providerCode = mustNonEmpty(params.providerCode, "providerCode");
  const providerName = mustNonEmpty(params.providerName, "providerName");
  const cargoSenderNumber = params.cargoSenderNumber?.trim() ?? null;

  const trackingLink = buildTrackingLink(
    trackingNumber,
    providerCode,
    providerName
  );

  const labelUrl =
    params.labelUrl?.trim() ||
    `https://example.com/test-label/${encodeURIComponent(
      trackingNumber
    )}.pdf`;
  const labelFormat = params.labelFormat ?? "PDF";

  await secureMarketplaceOrderUpdateMany(order.id, storeId, {
    cargoTrackingNumber: trackingNumber,
    cargoTrackingLink: trackingLink ?? null,
    cargoProviderCode: providerCode,
    cargoProviderName: providerName,
    cargoSenderNumber: cargoSenderNumber ?? undefined,
    cargoLastEventAt: now,
    cargoLastEventMessage: "Test takip güncellemesi",
    trackingRawData: { test: true, trackingNumber, providerCode } as unknown as Prisma.InputJsonValue,
    trackingUpdatedAt: now,
    cargoProviderChangedAt: order.cargoProviderChangedAt ?? now,
    shippingOperationStatus: "success",
    cargoLabelUrl: labelUrl,
    cargoLabelRawData: { format: labelFormat, test: true } as unknown as Prisma.InputJsonValue,
    labelFetchedAt: now
  });

  await prisma.marketplaceOrderTrackingEvent.create({
    data: {
      storeId,
      orderId: order.id,
      shipmentPackageId: order.shipmentPackageId,
      eventCode: "TEST",
      eventTitle: "TEST_TRACKING_UPDATED",
      eventDescription: "Test tracking güncellemesi",
      eventDateTime: now,
      rawData: { trackingNumber, providerCode, providerName } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: order.id,
      action: "TEST_TRACKING_UPDATED",
      message: `Test takip güncellendi: ${trackingNumber}`,
      previousStatus: order.packageStatus ?? null,
      nextStatus: order.packageStatus ?? null,
      relatedShipmentPackageId: order.shipmentPackageId,
      rawData: { trackingNumber, providerCode } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  await prisma.marketplaceOrderShippingEvent.create({
    data: {
      storeId,
      orderId: order.id,
      shipmentPackageId: order.shipmentPackageId,
      action: "TEST_TRACKING_UPDATED",
      message: `Test tracking güncellendi: ${trackingNumber}`,
      rawData: { trackingNumber, providerCode } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  await prisma.marketplaceOrderShippingEvent.create({
    data: {
      storeId,
      orderId: order.id,
      shipmentPackageId: order.shipmentPackageId,
      action: "LABEL_FETCHED",
      message: "Test etiketi saklandı.",
      rawData: { labelUrl, format: labelFormat } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TEST_TRACKING_UPDATED",
    entityType: "marketplace_order",
    entityId: order.id,
    message: `Test tracking updated [run:${testSource}]`
  });

  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TEST_LABEL_FETCHED",
    entityType: "marketplace_order",
    entityId: order.id,
    message: `Test label fetched [run:${testSource}]`
  });

  return { trackingUpdated: true, labelUpdated: true };
}

export async function simulateTestInvoice(params: {
  userId: string;
  storeId: string;
  testSource: string;
  orderId: string;
  invoiceNumber: string;
  invoiceDateTime: string;
  invoiceLink: string;
  invoiceStatus: "sent" | "failed";
}): Promise<{ invoiceId: string }> {
  const { userId, storeId, testSource, orderId } = params;
  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, storeId, isTestRecord: true, testSource }
  });
  if (!order) throw new Error("Test order bulunamadı.");
  const now = new Date();
  const membershipId = await getMembershipIdForUserStore(userId, storeId);

  const invoiceDate = new Date(params.invoiceDateTime);
  if (Number.isNaN(invoiceDate.getTime())) throw new Error("invoiceDateTime geçersiz.");

  await secureMarketplaceOrderUpdateMany(order.id, storeId, {
    invoiceNumber: params.invoiceNumber.trim(),
    invoiceDateTime: invoiceDate,
    invoiceLink: params.invoiceLink.trim(),
    invoiceStatus: params.invoiceStatus,
    invoiceSentAt: params.invoiceStatus === "sent" ? now : null,
    invoiceLastErrorMessage: params.invoiceStatus === "failed" ? "Test invoice failed" : null,
    invoiceRawData: { test: true } as unknown as Prisma.InputJsonValue,
    lastFetchedAt: now
  });

  const invoice = await prisma.marketplaceOrderInvoice.create({
    data: {
      storeId,
      orderId: order.id,
      shipmentPackageId: order.shipmentPackageId,
      invoiceNumber: params.invoiceNumber.trim(),
      invoiceDateTime: invoiceDate,
      invoiceLink: params.invoiceLink.trim(),
      invoiceStatus: params.invoiceStatus,
      rawData: { test: true } as unknown as Prisma.InputJsonValue,
      lastErrorMessage:
        params.invoiceStatus === "failed" ? "Test invoice failed" : null,
      isTestRecord: true,
      testSource
    },
    select: { id: true }
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: order.id,
      action: "TEST_INVOICE_SENT",
      message: `Test invoice: ${params.invoiceStatus}`,
      previousStatus: order.invoiceStatus ?? null,
      nextStatus: params.invoiceStatus,
      relatedShipmentPackageId: order.shipmentPackageId,
      rawData: { invoiceNumber: params.invoiceNumber.trim() } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TEST_INVOICE_SENT",
    entityType: "marketplace_order",
    entityId: order.id,
    message: `Test invoice simulated [run:${testSource}]`
  });

  return { invoiceId: invoice.id };
}

export async function createTestReturnClaim(params: {
  userId: string;
  storeId: string;
  testSource: string;
  orderId: string;
  claimId: string;
  claimStatus: string;
  returnReasonId?: string | null;
  returnReasonText?: string | null;
  rejectTrackingNumber?: string | null;
  rejectProviderName?: string | null;
  rejectPackageId?: string | null;
  approveOrReject?: "approve" | "reject" | null;
}): Promise<{ claimRecordId: string }> {
  const { userId, storeId, testSource, orderId } = params;
  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, storeId, isTestRecord: true, testSource },
    include: { lines: { orderBy: { createdAt: "asc" }, take: 20 } }
  });
  if (!order) throw new Error("Test order bulunamadı.");

  const membershipId = await getMembershipIdForUserStore(userId, storeId);
  const claimId = mustNonEmpty(params.claimId, "claimId");

  const collision = await prisma.marketplaceReturnClaim.findFirst({
    where: {
      storeId,
      platform: "trendyol",
      claimId
    },
    select: { id: true }
  });
  if (collision) throw new Error("Bu claimId daha önce mevcut.");

  const claimDate = new Date();
  const shipmentPackageId = order.shipmentPackageId;

  const claim = await prisma.marketplaceReturnClaim.create({
    data: {
      storeId,
      platform: "trendyol",
      claimId,
      orderNumber: order.orderNumber,
      shipmentPackageId,
      claimDate,
      claimStatus: params.approveOrReject ? "Created" : params.claimStatus,
      returnReasonId: params.returnReasonId ?? null,
      returnReasonText: params.returnReasonText ?? null,
      cargoTrackingNumber:
        params.rejectTrackingNumber?.trim() ?? order.cargoTrackingNumber,
      cargoProviderName:
        params.rejectProviderName?.trim() ?? order.cargoProviderName,
      totalPrice: order.totalPrice,
      currency: order.currency,
      rejectedPackageInfo:
        params.approveOrReject === "reject"
          ? ({
              packageId: params.rejectPackageId ?? shipmentPackageId,
              trackingNumber: params.rejectTrackingNumber ?? null,
              test: true
            } as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      replacementOutboundPackageInfo: Prisma.JsonNull,
      rawData: { test: true, orderId } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource,
      sandboxMode: true,
      lastFetchedAt: claimDate
    },
    select: { id: true }
  });

  // claim lines
  const movedLines = order.lines.slice(0, Math.min(5, order.lines.length));
  await prisma.marketplaceReturnClaimLine.createMany({
    data: movedLines.map((l) => ({
      storeId,
      claimIdRef: claim.id,
      lineId: l.lineId ?? undefined,
      barcode: l.barcode ?? undefined,
      stockCode: l.stockCode ?? undefined,
      productName: l.productName ?? undefined,
      quantity: l.quantity ?? 1,
      lineUnitPrice: l.lineUnitPrice ?? undefined,
      rawData: Prisma.JsonNull,
      isTestRecord: true,
      testSource
    }))
  });

  await prisma.marketplaceReturnClaimEvent.create({
    data: {
      storeId,
      claimRecordId: claim.id,
      action: "TEST_RETURN_CREATED",
      message: "Test claim oluşturuldu.",
      previousStatus: null,
      nextStatus: params.approveOrReject ? "Created" : params.claimStatus,
      rawData: { claimId } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TEST_RETURN_CREATED",
    entityType: "marketplace_return",
    entityId: claim.id,
    message: `Test return created [run:${testSource}]`
  });

  // approve/reject simulate
  if (params.approveOrReject === "approve") {
    await prisma.marketplaceReturnClaim.update({
      where: { id: claim.id },
      data: { claimStatus: "Accepted", lastFetchedAt: new Date() }
    });
    await prisma.marketplaceReturnClaimEvent.create({
      data: {
        storeId,
        claimRecordId: claim.id,
        action: "RETURN_CLAIM_APPROVED",
        message: "Test iade onayı",
        previousStatus: "Created",
        nextStatus: "Accepted",
        rawData: Prisma.JsonNull,
        isTestRecord: true,
        testSource
      }
    });
    await createActivityLog({
      userId,
      storeId,
      membershipId,
      action: "TEST_RETURN_APPROVED",
      entityType: "marketplace_return",
      entityId: claim.id,
      message: `Test return approved [run:${testSource}]`
    });
  }

  if (params.approveOrReject === "reject") {
    await prisma.marketplaceReturnClaim.update({
      where: { id: claim.id },
      data: {
        claimStatus: "Rejected",
        rejectedPackageInfo: {
          packageId: params.rejectPackageId ?? shipmentPackageId,
          trackingNumber: params.rejectTrackingNumber ?? null,
          test: true
        } as unknown as Prisma.InputJsonValue,
        cargoTrackingNumber: params.rejectTrackingNumber?.trim() ?? order.cargoTrackingNumber,
        cargoProviderName: params.rejectProviderName?.trim() ?? order.cargoProviderName,
        lastFetchedAt: new Date()
      }
    });
    await prisma.marketplaceReturnClaimEvent.create({
      data: {
        storeId,
        claimRecordId: claim.id,
        action: "RETURN_CLAIM_REJECTED",
        message: "Test iade reddi",
        previousStatus: "Created",
        nextStatus: "Rejected",
        rawData: {
          claimIssueReasonId: params.returnReasonId ?? null
        } as unknown as Prisma.InputJsonValue,
        isTestRecord: true,
        testSource
      }
    });
    await prisma.marketplaceReturnClaimEvent.create({
      data: {
        storeId,
        claimRecordId: claim.id,
        action: "TEST_TRACKING_UPDATED",
        message: "Test rejected package tracking güncellendi.",
        previousStatus: "Created",
        nextStatus: "Rejected",
        rawData: {
          trackingNumber: params.rejectTrackingNumber ?? null,
          cargoProviderName: params.rejectProviderName ?? null
        } as unknown as Prisma.InputJsonValue,
        isTestRecord: true,
        testSource
      }
    });
    await createActivityLog({
      userId,
      storeId,
      membershipId,
      action: "TEST_RETURN_REJECTED",
      entityType: "marketplace_return",
      entityId: claim.id,
      message: `Test return rejected [run:${testSource}]`
    });
  }

  return { claimRecordId: claim.id };
}

export async function simulateTestWebhook(params: {
  userId: string;
  storeId: string;
  testSource: string;
  orderId: string;
  nextPackageStatus: string;
  trackingNumber?: string | null;
  providerCode?: string | null;
  providerName?: string | null;
}): Promise<{ applied: boolean }> {
  const { userId, storeId, testSource, orderId } = params;
  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, storeId, isTestRecord: true, testSource }
  });
  if (!order) throw new Error("Test order bulunamadı.");
  const now = new Date();

  const prev = order.packageStatus;
  const next = normalizePackageStatusKey(params.nextPackageStatus) ?? params.nextPackageStatus;

  await secureMarketplaceOrderUpdateMany(order.id, storeId, {
    packageStatus: next,
    packageStatusUpdatedAt: now,
    lastFetchedAt: now,
    ...(params.trackingNumber ? { cargoTrackingNumber: params.trackingNumber.trim() } : {}),
    ...(params.providerCode ? { cargoProviderCode: params.providerCode.trim() } : {}),
    ...(params.providerName ? { cargoProviderName: params.providerName.trim() } : {})
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: order.id,
      action: "TEST_WEBHOOK_SIMULATED",
      message: `Test webhook gönderildi. ${prev ?? "—"} → ${next}`,
      previousStatus: prev,
      nextStatus: next,
      relatedShipmentPackageId: order.shipmentPackageId,
      rawData: { test: true, next, prev } as unknown as Prisma.InputJsonValue,
      isTestRecord: true,
      testSource
    }
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: order.id,
      action: "PACKAGE_STATUS_CHANGED",
      message: `Webhook (test) paket status: ${prev ?? "—"} → ${next}`,
      previousStatus: prev,
      nextStatus: next,
      relatedShipmentPackageId: order.shipmentPackageId,
      rawData: Prisma.JsonNull,
      isTestRecord: true,
      testSource
    }
  });

  const membershipId = await getMembershipIdForUserStore(userId, storeId);
  await createActivityLog({
    userId,
    storeId,
    membershipId,
    action: "TEST_WEBHOOK_SIMULATED",
    entityType: "marketplace_order",
    entityId: order.id,
    message: `Test webhook simulated [run:${testSource}]`
  });

  return { applied: true };
}

export async function getTestLabVerification(params: {
  testSource: string;
}): Promise<Record<string, unknown>> {
  const { testSource } = params;
  const orders = await prisma.marketplaceOrder.findMany({
    where: { isTestRecord: true, testSource },
    select: { id: true, storeId: true, orderNumber: true, shipmentPackageId: true, packageStatus: true, testSource: true, sandboxMode: true }
  });

  const orderEvents = await prisma.marketplaceOrderEvent.findMany({
    where: { isTestRecord: true, testSource },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, action: true, message: true, createdAt: true }
  });

  const trackingEvents = await prisma.marketplaceOrderTrackingEvent.findMany({
    where: { isTestRecord: true, testSource },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, eventTitle: true, eventCode: true, createdAt: true }
  });

  const shippingEvents = await prisma.marketplaceOrderShippingEvent.findMany({
    where: { isTestRecord: true, testSource },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, message: true, createdAt: true }
  });

  const invoices = await prisma.marketplaceOrderInvoice.findMany({
    where: { isTestRecord: true, testSource },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, invoiceNumber: true, invoiceStatus: true, createdAt: true }
  });

  const claims = await prisma.marketplaceReturnClaim.findMany({
    where: { isTestRecord: true, testSource },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, claimId: true, claimStatus: true, orderNumber: true, shipmentPackageId: true }
  });

  const claimEvents = await prisma.marketplaceReturnClaimEvent.findMany({
    where: { isTestRecord: true, testSource },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, claimRecordId: true, action: true, message: true, createdAt: true }
  });

  const activityLogs = await prisma.activityLog.findMany({
    where: {
      message: { contains: testSource },
      action: { startsWith: "TEST_" }
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, action: true, message: true, entityType: true, entityId: true, createdAt: true }
  });

  return {
    testSource,
    orders,
    testEvents: orderEvents,
    trackingEvents,
    shippingEvents,
    invoices,
    claims,
    claimEvents,
    activityLogs
  };
}

