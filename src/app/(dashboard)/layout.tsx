import { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { AppSessionProvider } from "@/components/providers/AppSessionProvider";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/premium/design-system";

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
      <AppShell>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden">
            <div className="mx-auto max-w-[1360px] px-6 py-6 lg:px-8">
              <Topbar />
              {children}
            </div>
          </main>
        </div>
      </AppShell>
    </AppSessionProvider>
  );
}

