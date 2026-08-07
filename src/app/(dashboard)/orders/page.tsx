import Link from "next/link";
import { OrderStatusFilterSelect } from "@/components/orders/OrderStatusFilterSelect";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { hasPermission } from "@/lib/activeStore";
import { OrdersTrendyolSyncButton } from "@/components/orders/OrdersTrendyolSyncButton";
import { OrdersHepsiburadaSyncButton } from "@/components/orders/OrdersHepsiburadaSyncButton";
import { OrderSyncStatusPanel } from "@/components/orders/OrderSyncStatusPanel";
import { resolveCargoProviderDisplay } from "@/lib/trendyolTracking";

type SearchParams = {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
};

type OrderListCargoRow = {
  packageStatus: string | null;
  cargoStatusText: string | null;
  cargoLastEventMessage: string | null;
  cargoTrackingNumber: string | null;
};

function formatMoney(n: number | null | undefined, cur: string) {
  if (n == null || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: cur || "TRY"
    }).format(n);
  } catch {
    return `${n} ${cur}`;
  }
}

const PACKAGE_STATUS_TR: Record<string, string> = {
  Created: "Oluşturuldu",
  Picking: "Hazırlanıyor",
  Invoiced: "Faturalandı",
  Shipped: "Kargoya verildi",
  Delivered: "Teslim edildi",
  Cancelled: "İptal edildi",
  UnDelivered: "Teslim edilemedi",
  Returned: "İade edildi",
  Repack: "Yeniden paketleme",
  UnPacked: "Parçalandı",
  UnSupplied: "Tedarik edilmedi",
  Unpacked: "Parçalandı"
};

function packageStatusTR(v: string | null | undefined) {
  if (!v) return "—";
  return PACKAGE_STATUS_TR[v] ?? v;
}

function cargoRowSummary(o: OrderListCargoRow): string {
  if (o.cargoStatusText?.trim()) return o.cargoStatusText.trim();
  if (o.cargoLastEventMessage?.trim()) return o.cargoLastEventMessage.trim();
  if (o.cargoTrackingNumber?.trim()) return "Takip numarası mevcut";
  if (o.packageStatus === "Shipped" || o.packageStatus === "Delivered")
    return "Kargo aşamasında";
  return "—";
}

function formatTrackingCell(t: string | null | undefined) {
  if (!t?.trim()) return "—";
  const s = t.trim();
  if (s.length <= 22) return s;
  return `${s.slice(0, 12)}…${s.slice(-6)}`;
}

function ingestSourceLabel(v: string | null | undefined) {
  if (v === "manual_sync") return "Manuel senkron";
  if (v === "webhook") return "Webhook";
  if (v === "operation") return "Operasyon (panel)";
  if (v === "split") return "Split paket";
  if (v === "cron_sync") return "Zamanlanmış senkron";
  if (v === "reconcile") return "Uzlaştırma";
  if (!v) return "—";
  return v;
}

export default async function OrdersPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
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
    requirePermission(ctx, "orders.view");
  } catch {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-slate-200">
        <p className="font-medium">Bu sayfaya erişim yetkiniz yok</p>
        <p className="mt-1 text-sm text-slate-400">
          Gerekli izin:{" "}
          <code className="text-slate-300">orders.view</code>
        </p>
      </div>
    );
  }

  const canManageOrders = hasPermission(ctx.permissionKeys, "orders.manage");
  const where: Prisma.MarketplaceOrderWhereInput = {
    storeId: ctx.storeId,
    isTestRecord: false
  };
  if (searchParams.status?.trim()) {
    where.packageStatus = searchParams.status.trim();
  }
  if (searchParams.q?.trim()) {
    where.orderNumber = {
      contains: searchParams.q.trim(),
      mode: "insensitive"
    };
  }
  const orderDate: Prisma.DateTimeFilter = {};
  if (searchParams.from?.trim()) {
    const d = new Date(searchParams.from);
    if (!Number.isNaN(d.getTime())) orderDate.gte = d;
  }
  if (searchParams.to?.trim()) {
    const d = new Date(searchParams.to);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      orderDate.lte = d;
    }
  }
  if (Object.keys(orderDate).length > 0) {
    where.orderDate = orderDate;
  }

  const [orders, syncState, runningJob, latestFailedJob, recentSyncJobs, hbSyncState, hbRunningJob, hbLatestFailedJob, hbRecentSyncJobs] = await Promise.all([
    prisma.marketplaceOrder.findMany({
    where,
    orderBy: { orderDate: "desc" },
    take: 200,
    select: {
      id: true,
      orderNumber: true,
      shipmentPackageId: true,
      packageStatus: true,
      cargoTrackingNumber: true,
      cargoProviderName: true,
      cargoProviderCode: true,
      cargoStatusText: true,
      cargoLastEventAt: true,
      cargoLastEventMessage: true,
      customerFirstName: true,
      customerLastName: true,
      totalPrice: true,
      currency: true,
      orderDate: true,
      platform: true,
      lastFetchedAt: true,
      lastIngestSource: true,
      cargoLabelUrl: true,
      shippingOperationStatus: true,
      cargoSenderNumber: true
    }
    }),
    prisma.storeOrderSyncState.findUnique({
      where: {
        storeId_platform: { storeId: ctx.storeId, platform: "trendyol" }
      }
    }),
    prisma.orderSyncJob.findFirst({
      where: {
        storeId: ctx.storeId,
        platform: "trendyol",
        status: "running"
      },
      select: { id: true, syncType: true, startedAt: true }
    }),
    prisma.orderSyncJob.findFirst({
      where: {
        storeId: ctx.storeId,
        platform: "trendyol",
        status: "failed"
      },
      orderBy: { finishedAt: "desc" },
      select: { id: true, finishedAt: true, errorMessage: true }
    }),
    prisma.orderSyncJob.findMany({
      where: { storeId: ctx.storeId, platform: "trendyol" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        syncType: true,
        status: true,
        finishedAt: true,
        packagesFetchedCount: true,
        failedCount: true,
        createdAt: true
      }
    }),
    prisma.storeOrderSyncState.findUnique({
      where: {
        storeId_platform: { storeId: ctx.storeId, platform: "hepsiburada" }
      }
    }),
    prisma.orderSyncJob.findFirst({
      where: {
        storeId: ctx.storeId,
        platform: "hepsiburada",
        status: "running"
      },
      select: { id: true, syncType: true, startedAt: true }
    }),
    prisma.orderSyncJob.findFirst({
      where: {
        storeId: ctx.storeId,
        platform: "hepsiburada",
        status: "failed"
      },
      orderBy: { finishedAt: "desc" },
      select: { id: true, finishedAt: true, errorMessage: true }
    }),
    prisma.orderSyncJob.findMany({
      where: { storeId: ctx.storeId, platform: "hepsiburada" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        syncType: true,
        status: true,
        finishedAt: true,
        packagesFetchedCount: true,
        failedCount: true,
        createdAt: true
      }
    })
  ]);

  const statusFilter = searchParams.status?.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Siparişler</h1>
          <p className="mt-1 text-sm text-slate-400">
            Aktif mağaza Trendyol siparişleri. Webhook veya &quot;Senkron Et&quot; ile
            güncellenir.
          </p>
        </div>
        {canManageOrders && (
          <div className="flex flex-wrap items-start gap-2">
            <OrdersTrendyolSyncButton statusFilter={statusFilter} />
            <OrdersHepsiburadaSyncButton />
          </div>
        )}
      </div>

      <OrderSyncStatusPanel
        syncState={syncState}
        running={runningJob}
        latestFailed={latestFailedJob}
        recentJobs={recentSyncJobs}
      />

      <OrderSyncStatusPanel
        syncState={hbSyncState}
        running={hbRunningJob}
        latestFailed={hbLatestFailedJob}
        recentJobs={hbRecentSyncJobs}
        label="Hepsiburada sipariş senkron durumu"
      />

      <div className="card">
        <form className="grid gap-3 md:grid-cols-12" method="get" action="/orders">
          <div className="md:col-span-3">
            <label className="label" htmlFor="q">
              Sipariş no
            </label>
            <input
              id="q"
              name="q"
              className="input"
              defaultValue={searchParams.q ?? ""}
              placeholder="Ara..."
            />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="status">
              Durum
            </label>
            <OrderStatusFilterSelect defaultValue={searchParams.status ?? ""} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="from">
              Başlangıç
            </label>
            <input
              id="from"
              name="from"
              type="date"
              className="input"
              defaultValue={searchParams.from ?? ""}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="to">
              Bitiş
            </label>
            <input
              id="to"
              name="to"
              type="date"
              className="input"
              defaultValue={searchParams.to ?? ""}
            />
          </div>
          <div className="flex items-end gap-2 md:col-span-3">
            <button type="submit" className="btn-primary flex-1">
              Filtrele
            </button>
            <Link
              href="/orders"
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              Sıfırla
            </Link>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto hidden md:block">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr>
              <th className="py-2 pr-2">Sipariş no</th>
              <th className="py-2 pr-2">Paket ID</th>
              <th className="py-2 pr-2">Paket durumu</th>
              <th className="py-2 pr-2">Kargo durumu</th>
              <th className="py-2 pr-2">Takip no</th>
              <th className="py-2 pr-2">Taşıyıcı</th>
              <th className="py-2 pr-2">Müşteri</th>
              <th className="py-2 pr-2">Toplam</th>
              <th className="py-2 pr-2">Tarih</th>
              <th className="py-2 pr-2">Son güncelleme</th>
              <th className="py-2 pr-2">Kaynak</th>
              <th className="py-2 pr-2">Etiket</th>
              <th className="py-2 pr-2">Kargo işl.</th>
              <th className="py-2 pr-2">Platform</th>
              <th className="py-2 text-right">Detay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {orders.map((o) => {
              const customer = [o.customerFirstName, o.customerLastName]
                .filter(Boolean)
                .join(" ");
              return (
                <tr key={o.id}>
                  <td className="py-2 pr-2 text-slate-100">{o.orderNumber}</td>
                  <td className="py-2 pr-2 font-mono text-xs text-slate-300">
                    {o.shipmentPackageId}
                  </td>
                  <td className="py-2 pr-2 text-slate-300">
                    {packageStatusTR(o.packageStatus)}
                  </td>
                  <td className="py-2 pr-2 max-w-[10rem] truncate text-xs text-slate-300" title={cargoRowSummary(o)}>
                    {cargoRowSummary(o)}
                  </td>
                  <td
                    className="py-2 pr-2 font-mono text-xs text-slate-300"
                    title={o.cargoTrackingNumber ?? undefined}
                  >
                    {formatTrackingCell(o.cargoTrackingNumber)}
                  </td>
                  <td className="py-2 pr-2 max-w-[8rem] truncate text-xs text-slate-300" title={resolveCargoProviderDisplay(o.cargoProviderCode, o.cargoProviderName)}>
                    {resolveCargoProviderDisplay(o.cargoProviderCode, o.cargoProviderName)}
                  </td>
                  <td className="py-2 pr-2 text-slate-300">{customer || "—"}</td>
                  <td className="py-2 pr-2 text-slate-200">
                    {formatMoney(o.totalPrice, o.currency)}
                  </td>
                  <td className="py-2 pr-2 text-slate-400">
                    {o.orderDate.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-2 text-xs text-slate-400">
                    {o.lastFetchedAt
                      ? o.lastFetchedAt.toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </td>
                  <td className="py-2 pr-2 text-xs text-slate-300">
                    {ingestSourceLabel(o.lastIngestSource)}
                  </td>
                  <td className="py-2 pr-2 text-xs text-slate-400">
                    {o.cargoLabelUrl ? "Var" : "—"}
                  </td>
                  <td className="py-2 pr-2 text-xs text-slate-400">
                    {o.shippingOperationStatus ?? "—"}
                  </td>
                  <td className="py-2 pr-2 text-slate-400">{o.platform}</td>
                  <td className="py-2 text-right">
                    <Link
                      href={`/orders/${o.id}`}
                      className="text-indigo-400 hover:underline"
                    >
                      Aç
                    </Link>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={15} className="py-8 text-center text-slate-500">
                  Kayıt yok. Trendyol bağlantınızı kontrol edip &quot;Senkron Et&quot;
                  kullanın.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {orders.map((o) => {
          const customer = [o.customerFirstName, o.customerLastName]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={o.id} className="card space-y-2 p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-100">{o.orderNumber}</div>
                  <div className="text-xs text-slate-400">
                    {o.orderDate.toISOString().slice(0, 16).replace("T", " ")}
                  </div>
                </div>
                <Link href={`/orders/${o.id}`} className="text-indigo-400 hover:underline">
                  Aç
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-300">
                <span className="text-slate-500">Durum</span>
                <span>{packageStatusTR(o.packageStatus)}</span>
                <span className="text-slate-500">Müşteri</span>
                <span>{customer || "—"}</span>
                <span className="text-slate-500">Toplam</span>
                <span>{formatMoney(o.totalPrice, o.currency)}</span>
                <span className="text-slate-500">Kargo</span>
                <span className="truncate" title={cargoRowSummary(o)}>
                  {cargoRowSummary(o)}
                </span>
              </div>
            </div>
          );
        })}
        {orders.length === 0 && (
          <div className="card p-6 text-center text-sm text-slate-500">
            Kayıt yok. Trendyol bağlantınızı kontrol edip &quot;Senkron Et&quot; kullanın.
          </div>
        )}
      </div>
    </div>
  );
}
