"use client";

import { useSession } from "next-auth/react";
import { useCallback, useMemo } from "react";
import {
  hasAllPermissions as hasAll,
  hasAnyPermission as hasAny,
  hasPermission as hasPerm,
  normalizePermissionKeys
} from "@/lib/permissionClient";

export function usePermissions() {
  const { data: session, status } = useSession();

  const permissionKeys = useMemo(
    () => normalizePermissionKeys(session?.permissionKeys),
    [session?.permissionKeys]
  );

  const hasPermission = useCallback(
    (key: string) => hasPerm(permissionKeys, key),
    [permissionKeys]
  );

  const hasAnyPermission = useCallback(
    (keys: string[]) => hasAny(permissionKeys, keys),
    [permissionKeys]
  );

  const hasAllPermissions = useCallback(
    (keys: string[]) => hasAll(permissionKeys, keys),
    [permissionKeys]
  );

  return {
    status,
    permissionKeys,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions
  };
}
