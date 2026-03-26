import { prisma } from "@/lib/prisma";
import {
  getEffectivePermissions,
  type StoreRoleOverlayLike
} from "@/lib/effectivePermissions";
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  normalizePermissionKeys
} from "@/lib/permissionClient";

export { hasPermission, hasAnyPermission, hasAllPermissions, normalizePermissionKeys };

export type ActiveStoreContext = {
  userId: string;
  storeId: string;
  membershipId: string;
  roleKey: string;
  permissionKeys: string[];
};

export async function resolveActiveStoreContextForUser(params: {
  userId: string;
  preferredStoreId?: string | null;
}): Promise<ActiveStoreContext | null> {
  const { userId, preferredStoreId } = params;

  const memberships = await prisma.storeMembership.findMany({
    where: {
      userId,
      isActive: true,
      store: { status: "active" }
    },
    include: {
      store: { select: { id: true } },
      role: {
        select: {
          key: true,
          rolePermissions: {
            select: { permission: { select: { key: true } } }
          }
        }
      },
      permissionOverrides: {
        select: { isAllowed: true, permission: { select: { key: true } } }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!memberships.length) return null;

  const chosen =
    (preferredStoreId
      ? memberships.find((m) => m.storeId === preferredStoreId)
      : null) ?? memberships[0];

  let storeRoleOverlays: StoreRoleOverlayLike[] | undefined;
  if (chosen.role.key !== "owner") {
    const rows = await prisma.storeRolePermission.findMany({
      where: { storeId: chosen.storeId, roleId: chosen.roleId },
      include: { permission: { select: { key: true } } }
    });
    storeRoleOverlays = rows.map((r) => ({
      permissionKey: r.permission.key,
      isGranted: r.isGranted
    }));
  }

  return {
    userId,
    storeId: chosen.storeId,
    membershipId: chosen.id,
    roleKey: chosen.role.key,
    permissionKeys: getEffectivePermissions(chosen, storeRoleOverlays)
  };
}

