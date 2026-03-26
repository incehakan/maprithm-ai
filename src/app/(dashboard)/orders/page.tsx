import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { hasPermission } from "@/lib/activeStore";
import { OrdersTrendyolSyncButton } from "@/components/orders/OrdersTrendyolSyncButton";

type SearchParams = {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
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

function ingestSourceLabel(v: string | null | undefined) {
  if (v === "manual_sync") return "Manuel senkron";
  if (v === "webhook") return "Webhook";
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
  const anyPrisma = prisma as unknown as {
    marketplaceOrder?: {
      findMany: (...args: unknown[]) => Promise<unknown[]>;
    };
  };
  if (!anyPrisma.marketplaceOrder) {
    return (
      <div className="rounded-lg border border-amber-700/40 bg-amber-500/10 p-6 text-amber-100">
        <p className="font-medium">Sipariş modeli henüz aktif değil</p>
        <p className="mt-1 text-sm text-amber-200/90">
          Prisma client eski olabilir. Sunucuyu yeniden başlatıp `npx prisma generate`
          komutunu tekrar çalıştırın.
        </p>
      </div>
    );
  }

  const where: Prisma.MarketplaceOrderWhereInput = { storeId: ctx.storeId };
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

  const orders = await anyPrisma.marketplaceOrder.findMany({
    where,
    orderBy: { orderDate: "desc" },
    take: 200
  }) as Array<{
    id: string;
    orderNumber: string;
    shipmentPackageId: string;
    packageStatus: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    totalPrice: number | null;
    currency: string;
    orderDate: Date;
    cargoTrackingNumber: string | null;
    platform: string;
    lastFetchedAt: Date | null;
    lastIngestSource: string | null;
  }>;

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
          <OrdersTrendyolSyncButton statusFilter={statusFilter} />
        )}
      </div>

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
            <select
              id="status"
              name="status"
              className="input"
              defaultValue={searchParams.status ?? ""}
            >
              <option value="">Tümü</option>
              <option value="Created">Oluşturuldu</option>
              <option value="Picking">Hazırlanıyor</option>
              <option value="Invoiced">Faturalandı</option>
              <option value="Shipped">Kargoya verildi</option>
              <option value="Delivered">Teslim edildi</option>
              <option value="Cancelled">İptal edildi</option>
              <option value="UnSupplied">Tedarik edilmedi</option>
              <option value="UnPacked">Parçalandı</option>
            </select>
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

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr>
              <th className="py-2 pr-2">Sipariş no</th>
              <th className="py-2 pr-2">Paket ID</th>
              <th className="py-2 pr-2">Durum</th>
              <th className="py-2 pr-2">Müşteri</th>
              <th className="py-2 pr-2">Toplam</th>
              <th className="py-2 pr-2">Tarih</th>
              <th className="py-2 pr-2">Son güncelleme</th>
              <th className="py-2 pr-2">Kaynak</th>
              <th className="py-2 pr-2">Kargo takip</th>
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
                    {o.cargoTrackingNumber ?? "—"}
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
                <td colSpan={11} className="py-8 text-center text-slate-500">
                  Kayıt yok. Trendyol bağlantınızı kontrol edip &quot;Senkron Et&quot;
                  kullanın.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
