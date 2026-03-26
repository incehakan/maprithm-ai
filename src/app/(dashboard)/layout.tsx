import { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { AppSessionProvider } from "@/components/providers/AppSessionProvider";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const activeStoreId = (session as any)?.activeStoreId ?? null;
  if (!activeStoreId) {
    redirect("/register-store");
  }

  return (
    <AppSessionProvider>
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <Sidebar />
        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <div className="mb-4 flex items-center justify-end">
              <UserMenu />
            </div>
            {children}
          </div>
        </main>
      </div>
    </AppSessionProvider>
  );
}

