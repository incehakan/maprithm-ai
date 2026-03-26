"use client";

import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

type Props =
  | {
      permission: string;
      children: ReactNode;
      anyOf?: undefined;
      allOf?: undefined;
    }
  | {
      anyOf: string[];
      children: ReactNode;
      permission?: undefined;
      allOf?: undefined;
    }
  | {
      allOf: string[];
      children: ReactNode;
      permission?: undefined;
      anyOf?: undefined;
    };

/**
 * Renders children only when the session has the required permission(s).
 * No placeholder — unauthorized users see nothing.
 */
export function PermissionGate(props: Props) {
  const { status, hasPermission, hasAnyPermission, hasAllPermissions } =
    usePermissions();

  if (status === "loading" || status === "unauthenticated") {
    return null;
  }

  let allowed = false;
  if ("permission" in props && props.permission) {
    allowed = hasPermission(props.permission);
  } else if ("anyOf" in props && props.anyOf?.length) {
    allowed = hasAnyPermission(props.anyOf);
  } else if ("allOf" in props && props.allOf?.length) {
    allowed = hasAllPermissions(props.allOf);
  }

  if (!allowed) return null;
  return <>{props.children}</>;
}
