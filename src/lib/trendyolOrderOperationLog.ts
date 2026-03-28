import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";

type Ctx = {
  userId: string;
  storeId: string;
  membershipId: string;
};

export async function logOrderOperationStarted(
  ctx: Ctx,
  orderId: string,
  shipmentPackageId: string,
  operation: string,
  payload?: unknown
) {
  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "TRENDYOL_ORDER_OPERATION_STARTED",
    entityType: "marketplace_order",
    entityId: orderId,
    message: `${operation} başladı (packageId=${shipmentPackageId})`
  });
  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId: ctx.storeId,
      orderId,
      action: "TRENDYOL_ORDER_OPERATION_STARTED",
      message: `${operation} başladı`,
      rawData: (payload ?? Prisma.JsonNull) as Prisma.InputJsonValue
    }
  });
}

export async function logOrderOperationCompleted(
  ctx: Ctx,
  orderId: string,
  operation: string,
  payload?: unknown
) {
  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "TRENDYOL_ORDER_OPERATION_COMPLETED",
    entityType: "marketplace_order",
    entityId: orderId,
    message: `${operation} tamamlandı`
  });
  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId: ctx.storeId,
      orderId,
      action: "TRENDYOL_ORDER_OPERATION_COMPLETED",
      message: `${operation} tamamlandı`,
      rawData: (payload ?? Prisma.JsonNull) as Prisma.InputJsonValue
    }
  });
}

export async function logOrderOperationFailed(
  ctx: Ctx,
  orderId: string,
  operation: string,
  error: string
) {
  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "TRENDYOL_ORDER_OPERATION_FAILED",
    entityType: "marketplace_order",
    entityId: orderId,
    message: `${operation} başarısız: ${error}`
  });
  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId: ctx.storeId,
      orderId,
      action: "TRENDYOL_ORDER_OPERATION_FAILED",
      message: `${operation} başarısız`,
      rawData: { error } as Prisma.InputJsonValue
    }
  });
}

