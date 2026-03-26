"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

type Props = {
  permission: string;
  children: ReactNode;
  /** Ayarlanırsa yetkisiz kullanıcı bu path'e yönlendirilir. */
  redirectTo?: string;
};

/**
 * İstemci tarafında sayfa erişim kontrolü. Sunucu guard'ı ile birlikte kullanın.
 */
export function ClientPagePermissionGuard({
  permission,
  children,
  redirectTo
}: Props) {
  const { status, hasPermission } = usePermissions();
  const router = useRouter();
  const allowed = hasPermission(permission);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!allowed && redirectTo) {
      router.replace(redirectTo);
    }
  }, [status, allowed, redirectTo, router]);

  if (status === "loading") {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
        Oturum yükleniyor…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  if (!allowed) {
    if (redirectTo) {
      return (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          Yönlendiriliyorsunuz…
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-8 text-center text-slate-200">
        <p className="text-base font-semibold">Bu sayfaya erişim yetkiniz yok</p>
        <p className="mt-2 text-sm text-slate-400">
          Gerekli izin:{" "}
          <code className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-200">
            {permission}
          </code>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
