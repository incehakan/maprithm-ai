import { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNavProvider } from "@/components/layout/MobileNavProvider";
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
    <AppSessionProvider session={session}>
      <AppShell>
        <MobileNavProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-x-hidden">
              <div className="mx-auto max-w-[1360px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
                <Topbar />
                {children}
              </div>
            </main>
          </div>
        </MobileNavProvider>
      </AppShell>
    </AppSessionProvider>
  );
}

