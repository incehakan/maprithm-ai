import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { AppShell, PanelSurface } from "@/components/premium/design-system";

export default async function SystemAdminLayout({
  children
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  try {
    await requireSystemAdmin();
  } catch {
    redirect("/dashboard");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-6">
        <PanelSurface className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-white">Sistem Yönetimi</h1>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin/system-connections" className="btn-secondary">
              System Connections
            </Link>
            <Link href="/admin/reference-sync" className="btn-secondary">
              Reference Sync
            </Link>
            <Link href="/dashboard" className="btn-secondary">
              Dashboard
            </Link>
          </div>
        </PanelSurface>
        {children}
      </div>
    </AppShell>
  );
}

