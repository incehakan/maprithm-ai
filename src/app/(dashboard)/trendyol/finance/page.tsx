import { redirect } from "next/navigation";
import { PageHeader, PanelSurface } from "@/components/premium/design-system";
import { TrendyolFinanceClient } from "@/components/trendyol/TrendyolFinanceClient";
import { hasPermission } from "@/lib/permissionClient";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

export default async function TrendyolFinancePage() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_STORE") {
      redirect("/register-store");
    }
    redirect("/login");
  }

  try {
    requirePermission(ctx, "trendyol.finance.view");
  } catch {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-slate-200">
        <p className="font-medium">Bu sayfaya erişim yetkiniz yok</p>
        <p className="mt-1 text-sm text-slate-400">
          Gerekli izin: <code className="text-slate-300">trendyol.finance.view</code>
        </p>
      </div>
    );
  }

  const canSync = hasPermission(ctx.permissionKeys, "trendyol.finance.sync");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trendyol cari ekstre (CHE)"
        subtitle="settlements ve otherfinancials — en fazla 15 günlük aralık. Kaynak: developers.trendyol.com"
      />

      <PanelSurface className="p-4">
        <TrendyolFinanceClient canSync={canSync} />
      </PanelSurface>
    </div>
  );
}
