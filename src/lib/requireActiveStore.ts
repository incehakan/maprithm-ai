import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissionClient";

export type RequiredStoreContext = {
  userId: string;
  storeId: string;
  membershipId: string;
  permissionKeys: string[];
  roleKey: string;
};

export async function requireActiveStore(): Promise<RequiredStoreContext> {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const storeId = (session as any)?.activeStoreId as string | undefined;
  const membershipId = (session as any)?.membershipId as string | undefined;
  const permissionKeys = ((session as any)?.permissionKeys as string[]) ?? [];
  const roleKey = ((session as any)?.roleKey as string | undefined) ?? "";

  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  if (!storeId || !membershipId) {
    throw new Error("NO_ACTIVE_STORE");
  }

  return { userId, storeId, membershipId, permissionKeys, roleKey };
}

export function requirePermission(ctx: RequiredStoreContext, key: string) {
  if (!hasPermission(ctx.permissionKeys, key)) {
    throw new Error("FORBIDDEN");
  }
}

