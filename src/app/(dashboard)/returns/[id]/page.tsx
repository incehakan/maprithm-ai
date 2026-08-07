import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { hasPermission } from "@/lib/activeStore";
import {
  PageHeader,
  PanelSurface,
  SectionHeader,
  StatusBadge
} from "@/components/premium/design-system";
import { ReturnDetailActions, type ReturnPlatform } from "@/components/returns/ReturnDetailActions";

function toReturnPlatform(p: string): ReturnPlatform {
  return p === "hepsiburada" ? "hepsiburada" : "trendyol";
}

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

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
      </div>
    );
  }

  const { id } = await params;
  const claim = await prisma.marketplaceReturnClaim.findFirst({
    where: { id, storeId: ctx.storeId, isTestRecord: false },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" } }
    },
    // claimType HB platformunda talep tipini taşır (Return, MissingItem vb.)
  });

  if (!claim) notFound();

  const canManage = hasPermission(ctx.permissionKeys, "returns.manage");
  const rawJson = claim.rawData != null ? JSON.stringify(claim.rawData, null, 2) : "";

  // claimType: HB raw payload'dan "claimType" alanı — Return, MissingItem, MissingPart vb.
  const claimType =
    claim.rawData != null && typeof claim.rawData === "object" && !Array.isArray(claim.rawData)
      ? ((claim.rawData as Record<string, unknown>).claimType as string | undefined) ??
        ((claim.rawData as Record<string, unknown>).type as string | undefined)
      : undefined;

  const platformLabel =
    claim.platform === "hepsiburada" ? "Hepsiburada" : claim.platform === "trendyol" ? "Trendyol" : claim.platform;

  return (
    <>
      <PageHeader
        title={`İade · ${claim.claimId}`}
        subtitle={`${platformLabel} · Sipariş: ${claim.orderNumber ?? "—"} · Paket: ${claim.shipmentPackageId ?? "—"}`}
        actions={
          <Link href="/returns" className="text-sm text-indigo-300 hover:underline">
            ← Liste
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PanelSurface>
            <SectionHeader title="Özet" />
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Durum</dt>
                <dd className="mt-1">
                  <StatusBadge variant={claimBadgeVariant(claim.claimStatus)}>
                    {claim.claimStatus}
                  </StatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Claim tarihi</dt>
                <dd className="mt-1 text-slate-200">
                  {claim.claimDate.toLocaleString("tr-TR")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Müşteri</dt>
                <dd className="mt-1 text-slate-200">
                  {[claim.customerFirstName, claim.customerLastName].filter(Boolean).join(" ") ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Tutar</dt>
                <dd className="mt-1 text-slate-200">
                  {formatMoney(claim.totalPrice, claim.currency)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">İade nedeni</dt>
                <dd className="mt-1 text-slate-200">
                  {claim.returnReasonText ?? "—"}
                  {claim.returnReasonId ? (
                    <span className="ml-2 text-xs text-slate-500">({claim.returnReasonId})</span>
                  ) : null}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Kargo takip</dt>
                <dd className="mt-1 font-mono text-sm text-slate-300">
                  {claim.cargoProviderName ?? "—"} · {claim.cargoTrackingNumber ?? "—"}
                </dd>
              </div>
            </dl>
          </PanelSurface>

          <PanelSurface>
            <SectionHeader title="Kalemler" />
            {claim.lines.length === 0 ? (
              <p className="text-sm text-slate-500">Satır yok.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="table-modern min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Ürün</th>
                      <th className="text-left">Barkod</th>
                      <th className="text-left">Stok</th>
                      <th className="text-right">Adet</th>
                      <th className="text-right">Birim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claim.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="max-w-[240px] text-slate-200">{l.productName ?? "—"}</td>
                        <td className="font-mono text-xs text-slate-400">{l.barcode ?? "—"}</td>
                        <td className="font-mono text-xs text-slate-400">{l.stockCode ?? "—"}</td>
                        <td className="text-right tabular-nums">{l.quantity}</td>
                        <td className="text-right tabular-nums text-slate-400">
                          {l.lineUnitPrice != null ? formatMoney(l.lineUnitPrice, claim.currency) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelSurface>

          <PanelSurface>
            <SectionHeader title="Red / değişim paket bilgisi" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-xs font-medium text-slate-500">rejectedPackageInfo</h4>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] text-slate-400">
                  {claim.rejectedPackageInfo != null
                    ? JSON.stringify(claim.rejectedPackageInfo, null, 2)
                    : "—"}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-medium text-slate-500">
                  replacementOutboundPackageInfo
                </h4>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] text-slate-400">
                  {claim.replacementOutboundPackageInfo != null
                    ? JSON.stringify(claim.replacementOutboundPackageInfo, null, 2)
                    : "—"}
                </pre>
              </div>
            </div>
          </PanelSurface>

          <details className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">
              rawData (geliştirici)
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-slate-500">
              {rawJson || "—"}
            </pre>
          </details>
        </div>

        <div className="space-y-6">
          <PanelSurface>
            <SectionHeader title="İşlemler" />
            <ReturnDetailActions
              recordId={claim.id}
              platform={toReturnPlatform(claim.platform)}
              claimType={claimType}
              claimStatus={claim.claimStatus}
              canManage={canManage}
            />
          </PanelSurface>

          <PanelSurface>
            <SectionHeader title="Olay zaman çizelgesi" />
            {claim.events.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz olay yok.</p>
            ) : (
              <ul className="space-y-4 border-l border-white/10 pl-4">
                {claim.events.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-400" />
                    <div className="text-[11px] text-slate-500">
                      {ev.createdAt.toLocaleString("tr-TR")}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-indigo-200">{ev.action}</div>
                    <p className="text-sm text-slate-300">{ev.message}</p>
                    {(ev.previousStatus || ev.nextStatus) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {ev.previousStatus ?? "—"} → {ev.nextStatus ?? "—"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </PanelSurface>
        </div>
      </div>
    </>
  );
}
