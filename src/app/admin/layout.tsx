import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";

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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Sistem Yönetimi</h1>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/admin/system-connections" className="text-indigo-300 hover:underline">
              System Connections
            </Link>
            <Link href="/admin/reference-sync" className="text-indigo-300 hover:underline">
              Reference Sync
            </Link>
            <Link href="/dashboard" className="text-slate-300 hover:underline">
              Dashboard
            </Link>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

