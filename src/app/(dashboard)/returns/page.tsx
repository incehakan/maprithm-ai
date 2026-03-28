import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { hasPermission } from "@/lib/activeStore";
import {
  EmptyState,
  PageHeader,
  PanelSurface,
  PremiumTable,
  StatusBadge
} from "@/components/premium/design-system";
import { ReturnsSyncButton } from "@/components/returns/ReturnsSyncButton";

type SearchParams = {
  claimStatus?: string;
  claimId?: string;
  orderNumber?: string;
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

function claimBadgeVariant(
  s: string
): "default" | "success" | "warning" | "danger" {
  const x = s.toLowerCase();
  if (x.includes("accept") || x.includes("resolved")) return "success";
  if (x.includes("reject")) return "danger";
  if (x.includes("wait") || x.includes("analysis") || x.includes("created"))
    return "warning";
  return "default";
}

function trackingShort(t: string | null | undefined, provider: string | null | undefined) {
  if (!t?.trim() && !provider?.trim()) return "—";
  const a = [provider?.trim(), t?.trim()].filter(Boolean).join(" · ");
  if (a.length <= 40) return a;
  return `${a.slice(0, 18)}…${a.slice(-10)}`;
}

export default async function ReturnsPage({ searchParams }: { searchParams: SearchParams }) {
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
    requirePermission(ctx, "returns.view");
  } catch {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-slate-200">
        <p className="font-medium">Bu sayfaya erişim yetkiniz yok</p>
        <p className="mt-1 text-sm text-slate-400">
          Gerekli izin: <code className="text-slate-300">returns.view</code>
        </p>
      </div>
    );
  }

  const canManage = hasPermission(ctx.permissionKeys, "returns.manage");

  const where: Prisma.MarketplaceReturnClaimWhereInput = { storeId: ctx.storeId };
  if (searchParams.claimStatus?.trim()) {
    where.claimStatus = { contains: searchParams.claimStatus.trim(), mode: "insensitive" };
  }
  if (searchParams.claimId?.trim()) {
    where.claimId = { contains: searchParams.claimId.trim(), mode: "insensitive" };
  }
  if (searchParams.orderNumber?.trim()) {
    where.orderNumber = { contains: searchParams.orderNumber.trim(), mode: "insensitive" };
  }

  const from = searchParams.from?.trim() ? new Date(`${searchParams.from}T00:00:00`) : null;
  const toRaw = searchParams.to?.trim() ? new Date(`${searchParams.to}T00:00:00`) : null;
  const to =
    toRaw && !Number.isNaN(toRaw.getTime()) ? new Date(toRaw.getTime()) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const dateFilter: Prisma.DateTimeFilter = {};
  if (from && !Number.isNaN(from.getTime())) dateFilter.gte = from;
  if (to && !Number.isNaN(to.getTime())) dateFilter.lte = to;
  if (Object.keys(dateFilter).length > 0) where.claimDate = dateFilter;

  const rows = await prisma.marketplaceReturnClaim.findMany({
    where,
    orderBy: { claimDate: "desc" },
    take: 200,
    select: {
      id: true,
      claimId: true,
      orderNumber: true,
      shipmentPackageId: true,
      claimStatus: true,
      customerFirstName: true,
      customerLastName: true,
      totalPrice: true,
      currency: true,
      claimDate: true,
      returnReasonText: true,
      cargoTrackingNumber: true,
      cargoProviderName: true
    }
  });

  return (
    <>
      <PageHeader
        title="İadeler"
        subtitle="Trendyol iade talepleri (claim) — mağaza kapsamında."
        actions={
          <div className="flex items-center gap-3">
            {canManage && <ReturnsSyncButton />}
          </div>
        }
      />

      <PanelSurface className="mb-6">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-slate-400">
            Durum
            <input
              name="claimStatus"
              defaultValue={searchParams.claimStatus ?? ""}
              className="input mt-1 w-full"
              placeholder="ör. WaitingInAction"
            />
          </label>
          <label className="text-xs text-slate-400">
            Claim ID
            <input
              name="claimId"
              defaultValue={searchParams.claimId ?? ""}
              className="input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-slate-400">
            Sipariş no
            <input
              name="orderNumber"
              defaultValue={searchParams.orderNumber ?? ""}
              className="input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-slate-400">
            Başlangıç
            <input
              name="from"
              type="date"
              defaultValue={searchParams.from ?? ""}
              className="input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-slate-400">
            Bitiş
            <input
              name="to"
              type="date"
              defaultValue={searchParams.to ?? ""}
              className="input mt-1 w-full"
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" className="btn-primary">
              Filtrele
            </button>
            <Link href="/returns" className="btn-secondary">
              Temizle
            </Link>
          </div>
        </form>
      </PanelSurface>

      {rows.length === 0 ? (
        <EmptyState
          title="Kayıt yok"
          description={
            canManage
              ? "Senkron ile Trendyol iadelerini çekin veya filtreleri gevşetin."
              : "Henüz iade kaydı yok veya filtrelere uyan sonuç yok."
          }
        />
      ) : (
        <PremiumTable>
          <thead>
            <tr>
              <th className="text-left">Claim</th>
              <th className="text-left">Sipariş</th>
              <th className="text-left">Paket</th>
              <th className="text-left">Durum</th>
              <th className="text-left">Müşteri</th>
              <th className="text-right">Tutar</th>
              <th className="text-left">Tarih</th>
              <th className="text-left">İade nedeni</th>
              <th className="text-left">Takip</th>
              <th className="text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const name = [r.customerFirstName, r.customerLastName].filter(Boolean).join(" ");
              return (
                <tr key={r.id}>
                  <td className="font-mono text-xs text-slate-300">{r.claimId}</td>
                  <td className="text-slate-200">{r.orderNumber ?? "—"}</td>
                  <td className="font-mono text-xs text-slate-400">{r.shipmentPackageId ?? "—"}</td>
                  <td>
                    <StatusBadge variant={claimBadgeVariant(r.claimStatus)}>
                      {r.claimStatus}
                    </StatusBadge>
                  </td>
                  <td className="text-slate-300">{name || "—"}</td>
                  <td className="text-right tabular-nums text-slate-200">
                    {formatMoney(r.totalPrice, r.currency)}
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-400">
                    {r.claimDate.toLocaleString("tr-TR")}
                  </td>
                  <td className="max-w-[200px] truncate text-xs text-slate-400">
                    {r.returnReasonText ?? "—"}
                  </td>
                  <td className="max-w-[180px] truncate text-xs text-slate-500">
                    {trackingShort(r.cargoTrackingNumber, r.cargoProviderName)}
                  </td>
                  <td className="text-right">
                    <Link href={`/returns/${r.id}`} className="text-indigo-300 hover:underline">
                      Detay
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </PremiumTable>
      )}
    </>
  );
}
