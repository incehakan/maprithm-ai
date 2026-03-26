import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { hasPermission } from "@/lib/activeStore";
import { OrdersPackageActionsClient } from "@/components/orders/OrdersPackageActionsClient";

type Props = { params: { id: string } };

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
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

export default async function OrderDetailPage({ params }: Props) {
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
          Gerekli izin: <code className="text-slate-300">orders.view</code>
        </p>
      </div>
    );
  }

  const anyPrisma = prisma as unknown as {
    marketplaceOrder?: {
      findFirst: (...args: unknown[]) => Promise<unknown>;
    };
  };
  if (!anyPrisma.marketplaceOrder) {
    return (
      <div className="rounded-lg border border-amber-700/40 bg-amber-500/10 p-6 text-amber-100">
        Prisma sipariş modeli henüz aktif değil. `npx prisma generate` sonrası dev
        sunucuyu yeniden başlatın.
      </div>
    );
  }

  const order = (await anyPrisma.marketplaceOrder.findFirst({
    where: { id: params.id, storeId: ctx.storeId },
    include: { lines: { orderBy: { createdAt: "asc" } } }
  })) as
    | {
        id: string;
        orderNumber: string;
        shipmentPackageId: string;
        platform: string;
        packageStatus: string | null;
        customerFirstName: string | null;
        customerLastName: string | null;
        customerEmailMasked: string | null;
        customerPhoneMasked: string | null;
        totalPrice: number | null;
        currency: string;
        orderDate: Date;
        cargoProviderName: string | null;
        cargoTrackingNumber: string | null;
        lastFetchedAt: Date | null;
        lastIngestSource: string | null;
        invoiceAddress: unknown;
        shipmentAddress: unknown;
        rawData: unknown;
        lines: Array<{
          id: string;
          barcode: string | null;
          stockCode: string | null;
          productName: string | null;
          quantity: number;
          lineUnitPrice: number | null;
        }>;
      }
    | null;

  if (!order) notFound();

  const customer = [order.customerFirstName, order.customerLastName]
    .filter(Boolean)
    .join(" ");

  const canManageOrders = hasPermission(ctx.permissionKeys, "orders.manage");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="text-sm text-indigo-400 hover:underline">
          ← Sipariş listesi
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Sipariş {order.orderNumber}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Paket: <span className="font-mono text-slate-300">{order.shipmentPackageId}</span>{" "}
          · {order.platform}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2 text-sm">
          <div className="font-semibold text-slate-100">Özet</div>
          <div className="grid grid-cols-2 gap-2 text-slate-300">
            <span className="text-slate-500">Durum</span>
            <span>{packageStatusTR(order.packageStatus)}</span>
            <span className="text-slate-500">Müşteri</span>
            <span>{customer || "—"}</span>
            <span className="text-slate-500">E-posta (maskeli)</span>
            <span className="break-all">{order.customerEmailMasked ?? "—"}</span>
            <span className="text-slate-500">Telefon (maskeli)</span>
            <span>{order.customerPhoneMasked ?? "—"}</span>
            <span className="text-slate-500">Toplam</span>
            <span>
              {order.totalPrice != null ? `${order.totalPrice} ${order.currency}` : "—"}
            </span>
            <span className="text-slate-500">Sipariş tarihi</span>
            <span>{order.orderDate.toISOString()}</span>
            <span className="text-slate-500">Kargo</span>
            <span>{order.cargoProviderName ?? "—"}</span>
            <span className="text-slate-500">Takip no</span>
            <span>{order.cargoTrackingNumber ?? "—"}</span>
            <span className="text-slate-500">Son güncelleme</span>
            <span>{order.lastFetchedAt?.toISOString() ?? "—"}</span>
            <span className="text-slate-500">Kaynak</span>
            <span>{ingestSourceLabel(order.lastIngestSource)}</span>
          </div>
        </div>
        <div className="card space-y-2 text-sm">
          <div className="font-semibold text-slate-100">Fatura adresi</div>
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900/80 p-3 text-xs text-slate-300">
            {order.invoiceAddress != null
              ? prettyJson(order.invoiceAddress)
              : "—"}
          </pre>
        </div>
        <div className="card space-y-2 text-sm md:col-span-2">
          <div className="font-semibold text-slate-100">Teslimat adresi</div>
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900/80 p-3 text-xs text-slate-300">
            {order.shipmentAddress != null
              ? prettyJson(order.shipmentAddress)
              : "—"}
          </pre>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="mb-3 text-sm font-semibold text-slate-100">Satırlar</div>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr>
              <th className="py-2">Barkod</th>
              <th className="py-2">Stok kodu</th>
              <th className="py-2">Ürün</th>
              <th className="py-2">Adet</th>
              <th className="py-2">Birim fiyat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td className="py-2 font-mono text-xs text-slate-300">{l.barcode ?? "—"}</td>
                <td className="py-2 text-slate-300">{l.stockCode ?? "—"}</td>
                <td className="py-2 text-slate-200">{l.productName ?? "—"}</td>
                <td className="py-2 text-slate-300">{l.quantity}</td>
                <td className="py-2 text-slate-300">
                  {l.lineUnitPrice != null ? String(l.lineUnitPrice) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="text-sm font-semibold text-slate-100">Ham veri özeti</div>
        <p className="mt-1 text-xs text-slate-500">
          Trendyol yanıtından saklanan normalize edilmiş paket gövdesi.
        </p>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-400">
          {order.rawData != null ? prettyJson(order.rawData) : "—"}
        </pre>
      </div>

      <OrdersPackageActionsClient
        orderId={order.id}
        shipmentPackageId={order.shipmentPackageId}
        packageStatus={order.packageStatus}
        cargoTrackingNumber={order.cargoTrackingNumber}
        cargoProviderName={order.cargoProviderName}
        canManageOrders={canManageOrders}
      />
    </div>
  );
}
