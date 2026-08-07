import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { hasPermission } from "@/lib/activeStore";
import { OrdersPackageActionsClient } from "@/components/orders/OrdersPackageActionsClient";
import { OrderPackageLifecycle } from "@/components/orders/OrderPackageLifecycle";
import { OrderRelatedPackages } from "@/components/orders/OrderRelatedPackages";
import { OrderInvoiceCardClient } from "@/components/orders/OrderInvoiceCardClient";
import { OrderCargoTrackingCard } from "@/components/orders/OrderCargoTrackingCard";
import { OrderShippingOperationsCard } from "@/components/orders/OrderShippingOperationsCard";
import { OrderAdvancedShippingOperationsCard } from "@/components/orders/OrderAdvancedShippingOperationsCard";
import {
  ingestSourceLabel,
  packageStatusTR
} from "@/components/orders/orderDisplayHelpers";
import type { TimelineEventInput } from "@/lib/orderLifecycle";

type Props = { params: Promise<{ id: string }> };

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default async function OrderDetailPage({ params }: Props) {
  const { id: orderId } = await params;
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

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, storeId: ctx.storeId }, // Allow test records so we can check mock orders
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" }, take: 200 },
      shippingEvents: { orderBy: { createdAt: "desc" }, take: 40 },
      splitFromPackage: {
        select: { id: true, shipmentPackageId: true, packageStatus: true }
      },
      splitChildPackages: {
        select: {
          id: true,
          shipmentPackageId: true,
          packageStatus: true,
          isSplitPackage: true
        }
      },
      trackingEvents: {
        orderBy: [{ eventDateTime: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!order) notFound();

  const recentInvoices = await prisma.marketplaceOrderInvoice.findMany({
    where: { orderId: order.id, storeId: ctx.storeId },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      invoiceStatus: true,
      createdAt: true,
      invoiceNumber: true,
      lastErrorMessage: true
    }
  });

  const relatedPackages = await prisma.marketplaceOrder.findMany({
    where: {
      storeId: ctx.storeId,
      platform: "trendyol",
      rootOrderNumber: order.rootOrderNumber
    },
    select: {
      id: true,
      shipmentPackageId: true,
      packageStatus: true,
      isSplitPackage: true,
      orderNumber: true
    }
  });

  const customer = [order.customerFirstName, order.customerLastName]
    .filter(Boolean)
    .join(" ");

  const canManageOrders = hasPermission(ctx.permissionKeys, "orders.manage");
  const rawOrder = order.rawData as Record<string, unknown> | null;
  const isMicroExport = rawOrder?.micro === true;

  const timelineEvents: TimelineEventInput[] = order.events.map((e) => ({
    id: e.id,
    action: e.action,
    message: e.message,
    createdAt: e.createdAt,
    previousStatus: e.previousStatus,
    nextStatus: e.nextStatus,
    relatedShipmentPackageId: e.relatedShipmentPackageId
  }));

  const statusChangesDesc = [...order.events]
    .filter((e) => e.action === "PACKAGE_STATUS_CHANGED")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const previousStatusFromTimeline =
    statusChangesDesc[0]?.previousStatus ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="text-sm text-indigo-400 hover:underline">
          ← Sipariş listesi
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Paket <span className="font-mono text-lg">{order.shipmentPackageId}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Sipariş no (referans):{" "}
          <span className="font-mono text-slate-300">{order.orderNumber}</span> · Kök:{" "}
          <span className="font-mono text-slate-300">{order.rootOrderNumber}</span> · {order.platform}
        </p>
      </div>

      <OrderPackageLifecycle
        events={timelineEvents}
        currentStatus={order.packageStatus}
        packageStatusUpdatedAt={order.packageStatusUpdatedAt}
        previousStatusFromTimeline={previousStatusFromTimeline}
        isSplitPackage={order.isSplitPackage}
        parentShipmentPackageId={order.parentShipmentPackageId}
        splitDetectedAt={order.splitDetectedAt}
        rootOrderNumber={order.rootOrderNumber}
      />

      <OrderCargoTrackingCard
        shipmentPackageId={order.shipmentPackageId}
        packageStatus={order.packageStatus}
        packageStatusUpdatedAt={order.packageStatusUpdatedAt}
        orderDate={order.orderDate}
        cargoTrackingNumber={order.cargoTrackingNumber}
        cargoTrackingLink={order.cargoTrackingLink}
        cargoProviderName={order.cargoProviderName}
        cargoProviderCode={order.cargoProviderCode}
        cargoStatusText={order.cargoStatusText}
        cargoLastEventAt={order.cargoLastEventAt}
        cargoLastEventMessage={order.cargoLastEventMessage}
        trackingEvents={order.trackingEvents.map((e) => ({
          id: e.id,
          eventTitle: e.eventTitle,
          eventDescription: e.eventDescription,
          eventDateTime: e.eventDateTime
        }))}
      />

      <OrderShippingOperationsCard
        orderId={order.id}
        shipmentPackageId={order.shipmentPackageId}
        canManage={canManageOrders}
        cargoProviderCode={order.cargoProviderCode}
        cargoProviderName={order.cargoProviderName}
        cargoSenderNumber={order.cargoSenderNumber}
        cargoTrackingNumber={order.cargoTrackingNumber}
        cargoTrackingLink={order.cargoTrackingLink}
        trackingUpdatedAt={order.trackingUpdatedAt?.toISOString() ?? null}
        cargoProviderChangedAt={order.cargoProviderChangedAt?.toISOString() ?? null}
        labelFetchedAt={order.labelFetchedAt?.toISOString() ?? null}
        cargoLabelUrl={order.cargoLabelUrl}
        shippingOperationStatus={order.shippingOperationStatus}
        shippingOperationLastErrorMessage={order.shippingOperationLastErrorMessage}
        shippingEvents={order.shippingEvents.map((e) => ({
          id: e.id,
          action: e.action,
          message: e.message,
          createdAt: e.createdAt.toISOString()
        }))}
      />

      <OrderAdvancedShippingOperationsCard
        orderId={order.id}
        shipmentPackageId={order.shipmentPackageId}
        canManage={canManageOrders}
        lines={order.lines.map((l) => ({
          id: l.id,
          lineId: l.lineId ? Number(l.lineId) : null,
          stockCode: l.stockCode,
          productName: l.productName,
          quantity: l.quantity
        }))}
      />

      {(order.splitChildPackages.length > 0 || order.splitFromPackage) && (
        <div className="card space-y-3">
          <div className="text-sm font-semibold text-slate-100">Paket ağacı</div>
          {order.splitFromPackage && (
            <div className="rounded-lg border border-slate-700 p-3 text-sm">
              <span className="text-slate-500">Üst paket: </span>
              <Link
                href={`/orders/${order.splitFromPackage.id}`}
                className="font-mono text-indigo-300 hover:underline"
              >
                {order.splitFromPackage.shipmentPackageId}
              </Link>
              <span className="ml-2 text-slate-400">
                ({packageStatusTR(order.splitFromPackage.packageStatus)})
              </span>
            </div>
          )}
          {order.splitChildPackages.length > 0 && (
            <div>
              <div className="mb-2 text-xs text-slate-500">Bu paketten türeyen paketler</div>
              <ul className="flex flex-col gap-2">
                {order.splitChildPackages.map((ch) => (
                  <li key={ch.id}>
                    <Link
                      href={`/orders/${ch.id}`}
                      className="inline-flex items-center gap-2 font-mono text-sm text-indigo-300 hover:underline"
                    >
                      {ch.shipmentPackageId}
                      {ch.isSplitPackage && (
                        <span className="rounded border border-violet-500/40 px-1.5 text-[10px] text-violet-200">
                          split
                        </span>
                      )}
                      <span className="text-slate-500">
                        ({packageStatusTR(ch.packageStatus)})
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <OrderRelatedPackages currentId={order.id} packages={relatedPackages} />

      <OrderInvoiceCardClient
        orderId={order.id}
        shipmentPackageId={order.shipmentPackageId}
        canManageOrders={canManageOrders}
        isMicroExport={isMicroExport}
        invoiceStatus={order.invoiceStatus}
        invoiceLink={order.invoiceLink}
        invoiceNumber={order.invoiceNumber}
        invoiceDateTime={order.invoiceDateTime?.toISOString() ?? null}
        invoiceSentAt={order.invoiceSentAt?.toISOString() ?? null}
        invoiceLastErrorMessage={order.invoiceLastErrorMessage}
        recentAttempts={recentInvoices.map((r) => ({
          id: r.id,
          invoiceStatus: r.invoiceStatus,
          createdAt: r.createdAt.toISOString(),
          invoiceNumber: r.invoiceNumber,
          lastErrorMessage: r.lastErrorMessage
        }))}
      />

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
            <span className="text-slate-500">Müşteri ID</span>
            <span>{order.customerId ?? "—"}</span>
            <span className="text-slate-500">Delivery Address Type</span>
            <span>{order.deliveryAddressType ?? "—"}</span>
            <span className="text-slate-500">Fatura özeti</span>
            <span className="text-slate-400">
              Yukarıdaki <strong className="text-slate-300">Fatura</strong> kartında
            </span>
            <span className="text-slate-500">Son güncelleme</span>
            <span>{order.lastFetchedAt?.toISOString() ?? "—"}</span>
            <span className="text-slate-500">Kaynak</span>
            <span>{ingestSourceLabel(order.lastIngestSource)}</span>
            <span className="text-slate-500">Statü güncelleme</span>
            <span>{order.packageStatusUpdatedAt?.toISOString() ?? "—"}</span>
          </div>
        </div>
        <div className="card space-y-2 text-sm">
          <div className="font-semibold text-slate-100">Fatura adresi</div>
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900/80 p-3 text-xs text-slate-300">
            {order.invoiceAddress != null ? prettyJson(order.invoiceAddress) : "—"}
          </pre>
        </div>
        <div className="card space-y-2 text-sm md:col-span-2">
          <div className="font-semibold text-slate-100">Teslimat adresi</div>
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900/80 p-3 text-xs text-slate-300">
            {order.shipmentAddress != null ? prettyJson(order.shipmentAddress) : "—"}
          </pre>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="mb-3 text-sm font-semibold text-slate-100">Satırlar</div>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr>
              <th className="py-2">Barkod</th>
              <th className="py-2">Line ID</th>
              <th className="py-2">Stok kodu</th>
              <th className="py-2">Ürün</th>
              <th className="py-2">Satır durum</th>
              <th className="py-2">Adet</th>
              <th className="py-2">Birim fiyat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td className="py-2 font-mono text-xs text-slate-300">{l.barcode ?? "—"}</td>
                <td className="py-2 text-slate-300">{l.lineId ?? "—"}</td>
                <td className="py-2 text-slate-300">{l.stockCode ?? "—"}</td>
                <td className="py-2 text-slate-200">{l.productName ?? "—"}</td>
                <td className="py-2 text-slate-300">{l.lineStatus ?? "—"}</td>
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
        <div className="mb-3 text-sm font-semibold text-slate-100">Tüm operasyon / sistem eventleri</div>
        <div className="space-y-2">
          {[...order.events]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((evt) => (
              <div key={evt.id} className="rounded-lg border border-slate-700 p-3 text-xs">
                <div className="font-semibold text-slate-200">{evt.action}</div>
                <div className="mt-1 text-slate-400">{evt.message}</div>
                <div className="mt-1 text-slate-500">{evt.createdAt.toISOString()}</div>
              </div>
            ))}
          {order.events.length === 0 && (
            <div className="text-xs text-slate-500">Henüz event kaydı yok.</div>
          )}
        </div>
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
        canManageOrders={canManageOrders}
        lines={order.lines.map((l) => ({
          id: l.id,
          lineId: l.lineId,
          stockCode: l.stockCode,
          productName: l.productName,
          quantity: l.quantity
        }))}
      />
    </div>
  );
}
