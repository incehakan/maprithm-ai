import { Prisma } from "@prisma/client";
import { createActivityLog } from "@/lib/activityLog";
import { prisma } from "@/lib/prisma";

type AuditParams = {
  storeId: string;
  userId: string;
  membershipId: string | null;
  orderId: string;
  shipmentPackageId: string;
  action: string;
  message: string;
  rawData?: unknown;
  activityAction: string;
  activityMessage: string;
};

export async function recordShippingOperationAudit(params: AuditParams): Promise<void> {
  const raw =
    params.rawData === undefined
      ? undefined
      : (params.rawData as Prisma.InputJsonValue);

  await prisma.marketplaceOrderShippingEvent.create({
    data: {
      storeId: params.storeId,
      orderId: params.orderId,
      shipmentPackageId: params.shipmentPackageId,
      action: params.action,
      message: params.message,
      ...(raw !== undefined ? { rawData: raw } : {})
    }
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId: params.storeId,
      orderId: params.orderId,
      action: params.action,
      message: params.message,
      relatedShipmentPackageId: params.shipmentPackageId,
      ...(raw !== undefined ? { rawData: raw } : {})
    }
  });

  await createActivityLog({
    userId: params.userId,
    storeId: params.storeId,
    membershipId: params.membershipId,
    action: params.activityAction,
    entityType: "marketplace_order",
    entityId: params.orderId,
    message: params.activityMessage
  });
}
