export type PermissionOverrideLike = {
  isAllowed: boolean;
  permission: { key: string };
};

export type RolePermissionLike = {
  permission: { key: string };
};

export type MembershipLikeForPermissions = {
  role: {
    key: string;
    rolePermissions: RolePermissionLike[];
  };
  permissionOverrides: PermissionOverrideLike[];
};

export type StoreRoleOverlayLike = {
  permissionKey: string;
  isGranted: boolean;
};

/**
 * Owner rolü mağaza overlay’lerinden etkilenmez (tam sistem rolü).
 */
export function getEffectivePermissions(
  membership: MembershipLikeForPermissions,
  storeRoleOverlays?: StoreRoleOverlayLike[] | null
): string[] {
  const rolePermissionKeys = membership.role.rolePermissions.map(
    (rp) => rp.permission.key
  );

  const effective = new Set<string>(rolePermissionKeys);

  if (
    membership.role.key !== "owner" &&
    storeRoleOverlays &&
    storeRoleOverlays.length > 0
  ) {
    for (const o of storeRoleOverlays) {
      if (o.isGranted) effective.add(o.permissionKey);
      else effective.delete(o.permissionKey);
    }
  }

  for (const o of membership.permissionOverrides) {
    const key = o.permission.key;
    if (o.isAllowed) effective.add(key);
    else effective.delete(key);
  }

  return Array.from(effective.values()).sort();
}

