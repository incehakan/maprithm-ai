/**
 * Permission checks for session.permissionKeys (client or server).
 * Keep logic pure so SSR pages and hooks share the same behavior.
 */
export function normalizePermissionKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return keys.filter((k): k is string => typeof k === "string");
}

export function hasPermission(
  permissionKeys: string[] | null | undefined,
  permissionKey: string
): boolean {
  const keys = normalizePermissionKeys(permissionKeys ?? []);
  return keys.includes(permissionKey);
}

export function hasAnyPermission(
  permissionKeys: string[] | null | undefined,
  permissionKeysList: string[]
): boolean {
  if (!permissionKeysList.length) return false;
  const keys = normalizePermissionKeys(permissionKeys ?? []);
  return permissionKeysList.some((k) => keys.includes(k));
}

export function hasAllPermissions(
  permissionKeys: string[] | null | undefined,
  permissionKeysList: string[]
): boolean {
  if (!permissionKeysList.length) return true;
  const keys = normalizePermissionKeys(permissionKeys ?? []);
  return permissionKeysList.every((k) => keys.includes(k));
}
