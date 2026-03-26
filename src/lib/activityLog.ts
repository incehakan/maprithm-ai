import { prisma } from "./prisma";

type CreateActivityLogParams = {
  userId: string;
  storeId?: string | null;
  membershipId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  message: string;
};

export async function createActivityLog({
  userId,
  storeId,
  membershipId,
  action,
  entityType,
  entityId,
  message
}: CreateActivityLogParams): Promise<void> {
  try {
    const anyPrisma = prisma as any;
    if (
      !anyPrisma.activityLog ||
      typeof anyPrisma.activityLog.create !== "function"
    ) {
      console.warn(
        "activityLog modeli Prisma client'ta bulunamadı. migrate/generate sonrası dev server'ı yeniden başlatın."
      );
      return;
    }

    await anyPrisma.activityLog.create({
      data: {
        userId,
        storeId: storeId ?? null,
        membershipId: membershipId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        message
      }
    });
  } catch (err) {
    console.error("ActivityLog create error:", err);
  }
}

