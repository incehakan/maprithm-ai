import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  checkProductHealth,
  calculateHealthSummary,
  getHealthScoreColor,
  type ProductForHealth
} from "@/lib/productHealth";
import { getOnboardingStatus, type OnboardingStatus } from "@/lib/onboarding";
import { DemoDataButtons } from "@/components/dashboard/DemoDataButtons";
import { Activity, AlertTriangle, CircleDollarSign, ShoppingBag } from "lucide-react";
import {
  EmptyState,
  KPIStatCard,
  PageHeader,
  PanelSurface,
  PremiumTable,
  SectionHeader
} from "@/components/premium/design-system";

type DashboardStats = {
  totalProducts: number;
  publishedProducts: number;
  draftProducts: number;
  readyProducts: number;
  unpublishedProducts: number;
  totalStock: number;
  totalValue: number;
  averageHealthScore: number;
  missingSeo: number;
  zeroPrice: number;
  zeroStock: number;
};

type ActivityLog = {
  id: string;
  message: string;
  createdAt: Date;
};

type ProblematicProduct = {
  id: string;
  name: string;
  status: string;
  healthScore: number;
  issueCount: number;
};

type OrdersDashboardStats = {
  todayOrderCount: number;
  todayRevenue: number;
  pendingOrderCount: number;
  last7Days: Array<{ day: string; count: number }>;
  topProducts: Array<{
    stockCode: string | null;
    productName: string | null;
    quantity: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    shipmentPackageId: string;
    packageStatus: string | null;
    totalPrice: number | null;
    currency: string;
    orderDate: Date;
    customerFirstName: string | null;
    customerLastName: string | null;
  }>;
};

async function getDashboardData(userId: string, storeId: string) {
  const products = await prisma.product.findMany({
    where: { userId, storeId },
    orderBy: { createdAt: "desc" }
  });

  const productsForHealth: ProductForHealth[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    brand: p.brand,
    sku: p.sku,
    price: Number(p.price),
    stock: p.stock,
    seoDescription: p.seoDescription,
    tags: p.tags,
    status: (p as any).lifecycleStatus ?? p.status
  }));

  const healthResults = productsForHealth.map((p) => checkProductHealth(p));
  const healthSummary = calculateHealthSummary(productsForHealth, healthResults);

  const stats: DashboardStats = {
    totalProducts: products.length,
    publishedProducts: products.filter((p) => (p as any).lifecycleStatus === "published").length,
    draftProducts: products.filter((p) => p.status === "draft").length,
    readyProducts: products.filter((p) => (p as any).lifecycleStatus === "ready").length,
    unpublishedProducts: products.filter((p) => (p as any).lifecycleStatus === "unpublished").length,
    totalStock: products.reduce((acc, p) => acc + p.stock, 0),
    totalValue: products.reduce(
      (acc, p) => acc + Number(p.price) * p.stock,
      0
    ),
    averageHealthScore: healthSummary.averageHealthScore,
    missingSeo: healthSummary.missingSeo,
    zeroPrice: products.filter((p) => Number(p.price) <= 0).length,
    zeroStock: products.filter((p) => p.stock <= 0).length
  };

  // Demo ürün sayısı
  const demoProductCount = products.filter((p) => (p as any).isDemo === true).length;

  const problematicProducts: ProblematicProduct[] = healthResults
    .filter((r) => r.issueCount > 0)
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 5)
    .map((r) => ({
      id: r.productId,
      name: r.productName,
      status: r.status,
      healthScore: r.healthScore,
      issueCount: r.issueCount
    }));

  return { stats, problematicProducts, demoProductCount };
}

async function getRecentActivity(userId: string, storeId: string): Promise<ActivityLog[]> {
  const anyPrisma = prisma as any;

  if (
    !anyPrisma.activityLog ||
    typeof anyPrisma.activityLog.findMany !== "function"
  ) {
    return [];
  }

  const logs = await anyPrisma.activityLog.findMany({
    where: { userId, storeId },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return logs.map((log: any) => ({
    id: log.id,
    message: log.message,
    createdAt: log.createdAt
  }));
}

async function getOrdersDashboardData(storeId: string): Promise<OrdersDashboardStats> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const pendingStatuses = ["Created", "Picking", "Invoiced"];

  const [todayAgg, pendingOrderCount, topProductsRaw, recentOrders, last7Raw] =
    await Promise.all([
      prisma.marketplaceOrder.aggregate({
        where: {
          storeId,
          orderDate: { gte: todayStart, lte: todayEnd }
        },
        _count: { _all: true },
        _sum: { totalPrice: true }
      }),
      prisma.marketplaceOrder.count({
        where: {
          storeId,
          packageStatus: { in: pendingStatuses }
        }
      }),
      prisma.marketplaceOrderLine.groupBy({
        by: ["stockCode", "productName"],
        where: { storeId },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5
      }),
      prisma.marketplaceOrder.findMany({
        where: { storeId },
        orderBy: { orderDate: "desc" },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          shipmentPackageId: true,
          packageStatus: true,
          totalPrice: true,
          currency: true,
          orderDate: true,
          customerFirstName: true,
          customerLastName: true
        }
      }),
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT d.day::date AS day,
               COALESCE(COUNT(o.id), 0)::bigint AS count
        FROM generate_series(
          date_trunc('day', NOW()) - interval '6 day',
          date_trunc('day', NOW()),
          interval '1 day'
        ) AS d(day)
        LEFT JOIN "MarketplaceOrder" o
          ON o."storeId" = CAST(${storeId} AS uuid)
         AND date_trunc('day', o."orderDate") = d.day
        GROUP BY d.day
        ORDER BY d.day ASC
      `
    ]);

  return {
    todayOrderCount: todayAgg._count._all ?? 0,
    todayRevenue: Number(todayAgg._sum.totalPrice ?? 0),
    pendingOrderCount,
    last7Days: last7Raw.map((r) => ({
      day: new Date(r.day).toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit"
      }),
      count: Number(r.count)
    })),
    topProducts: topProductsRaw.map((r) => ({
      stockCode: r.stockCode,
      productName: r.productName,
      quantity: r._sum.quantity ?? 0
    })),
    recentOrders
  };
}

const STATUS_COLORS: Record<string, string> = {
  published: "bg-emerald-600",
  draft: "bg-slate-600",
  ready: "bg-indigo-600",
  unpublished: "bg-amber-600",
  archived: "bg-zinc-700"
};

const STATUS_LABELS: Record<string, string> = {
  published: "Yayında",
  draft: "Taslak",
  ready: "Hazır",
  unpublished: "Yayından Kaldırılmış",
  archived: "Arşivlenmiş"
};

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user || !(session.user as any).id) {
    redirect("/login");
  }

  const userId = (session.user as any).id as string;
  const storeId = (session as any).activeStoreId as string | undefined;
  if (!storeId) {
    redirect("/login");
  }

  const [
    { stats, problematicProducts, demoProductCount },
    recentActivity,
    onboarding,
    ordersStats
  ] = await Promise.all([
    getDashboardData(userId, storeId),
    getRecentActivity(userId, storeId),
    getOnboardingStatus({ userId, storeId }),
    getOrdersDashboardData(storeId)
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Ticaret Kontrol Merkezi"
        subtitle="E-ticaret performansınızı, sipariş akışınızı ve ürün sağlığınızı tek merkezden yönetin."
      />

      <PanelSurface className="relative overflow-hidden border-indigo-300/25 bg-gradient-to-br from-indigo-500/20 via-violet-500/10 to-cyan-500/10 p-6">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-indigo-400/25 blur-3xl" />
        <div className="absolute -bottom-10 left-1/3 h-28 w-28 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-indigo-100/80">Yönetici Özeti</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Bugün operasyonların merkezindesin</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-200/85">
              Sipariş, gelir ve ürün sağlığı metrikleri tek bakışta. Kritik bölgeler önce göze çarpar.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/orders" className="btn-secondary">Siparişleri Aç</Link>
            <Link href="/products" className="btn-primary">Ürünleri Yönet</Link>
          </div>
        </div>
      </PanelSurface>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          label="Bugünkü Sipariş"
          value={String(ordersStats.todayOrderCount)}
          tone="important"
          icon={ShoppingBag}
          trend="Düne göre +12%"
        />
        <KPIStatCard
          label="Bugünkü Ciro"
          value={`₺${ordersStats.todayRevenue.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`}
          tone="important"
          icon={CircleDollarSign}
          trend="Marj artışı +4,6%"
        />
        <KPIStatCard
          label="Bekleyen Sipariş"
          value={String(ordersStats.pendingOrderCount)}
          detail="Oluşturuldu / Hazırlanıyor / Faturalandı"
          tone="warning"
          icon={AlertTriangle}
        />
        <KPIStatCard
          label="Son 7 Gün Toplam"
          value={String(ordersStats.last7Days.reduce((acc, d) => acc + d.count, 0))}
          icon={Activity}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <PanelSurface className="lg:col-span-2">
          <SectionHeader title="Son 7 Gün Sipariş Grafiği" />
          <div className="flex h-48 items-end gap-2">
            {ordersStats.last7Days.map((d) => {
              const max = Math.max(...ordersStats.last7Days.map((x) => x.count), 1);
              const h = Math.max(6, Math.round((d.count / max) * 150));
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
                  <div className="text-xs text-slate-400">{d.count}</div>
                  <div
                    className="w-full rounded-t bg-indigo-500/80"
                    style={{ height: `${h}px` }}
                  />
                  <div className="text-[11px] text-slate-500">{d.day}</div>
                </div>
              );
            })}
          </div>
        </PanelSurface>
        <PanelSurface>
          <SectionHeader title="En Çok Satan 5 Ürün" />
          {ordersStats.topProducts.length === 0 ? (
            <EmptyState
              title="Henüz sipariş satırı yok"
              description="İlk siparişler geldikçe burada en çok satan ürünleri göreceksiniz."
            />
          ) : (
            <ul className="space-y-2">
              {ordersStats.topProducts.map((p, idx) => (
                <li key={`${p.stockCode ?? "na"}-${idx}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:-translate-y-[1px] hover:border-indigo-300/30">
                  <div className="text-sm text-slate-200 truncate">
                    {p.productName || p.stockCode || "İsimsiz ürün"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.stockCode ? `SKU: ${p.stockCode} · ` : ""}{p.quantity} adet
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelSurface>
      </div>

      <PanelSurface>
        <SectionHeader title="Son Siparişler" />
        <PremiumTable>
          <thead className="text-left text-xs text-slate-400">
            <tr>
              <th className="py-2 pr-2">Sipariş No</th>
              <th className="py-2 pr-2">Paket ID</th>
              <th className="py-2 pr-2">Müşteri</th>
              <th className="py-2 pr-2">Durum</th>
              <th className="py-2 pr-2">Tutar</th>
              <th className="py-2 pr-2">Tarih</th>
            </tr>
          </thead>
          <tbody>
            {ordersStats.recentOrders.map((o) => (
              <tr key={o.id}>
                <td className="py-2 pr-2 text-slate-200">{o.orderNumber}</td>
                <td className="py-2 pr-2 font-mono text-xs text-slate-400">{o.shipmentPackageId}</td>
                <td className="py-2 pr-2 text-slate-300">
                  {[o.customerFirstName, o.customerLastName].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="py-2 pr-2 text-slate-300">{o.packageStatus ?? "—"}</td>
                <td className="py-2 pr-2 text-slate-200">
                  {o.totalPrice != null
                    ? `${o.totalPrice.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${o.currency}`
                    : "—"}
                </td>
                <td className="py-2 pr-2 text-slate-400">
                  {o.orderDate.toLocaleString("tr-TR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </td>
              </tr>
            ))}
            {ordersStats.recentOrders.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  <div className="mx-auto max-w-md">
                    <EmptyState
                      title="Sipariş verisi bulunamadı"
                      description="Siparişler geldikçe burada listelenecek."
                    />
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </PremiumTable>
      </PanelSurface>

      {/* Onboarding Kartı */}
      {!onboarding.isComplete && (
        <PanelSurface className="border-indigo-400/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Başlangıç Adımları</h2>
              <p className="mt-1 text-sm text-slate-400">
                Sistemi tam potansiyeliyle kullanmak için aşağıdaki adımları tamamlayın.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-400">
                  %{onboarding.progressPercent}
                </div>
                <div className="text-xs text-slate-500">
                  {onboarding.completedCount}/{onboarding.totalCount} tamamlandı
                </div>
              </div>
            </div>
          </div>

          {/* İlerleme Barı */}
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${onboarding.progressPercent}%` }}
              />
            </div>
          </div>

          {/* Adım Listesi */}
          <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {onboarding.steps.map((step) => (
              <div
                key={step.id}
                className={`rounded-lg border p-3 transition-colors ${
                  step.completed
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                      step.completed
                        ? "bg-emerald-500 text-white"
                        : "border-2 border-slate-600"
                    }`}
                  >
                    {step.completed && (
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium ${
                        step.completed ? "text-emerald-400" : "text-slate-200"
                      }`}
                    >
                      {step.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 truncate">
                      {step.description}
                    </div>
                    {!step.completed && (
                      <Link
                        href={step.actionHref}
                        className="mt-2 inline-block text-xs font-medium text-blue-400 hover:text-blue-300"
                      >
                        {step.actionLabel} →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PanelSurface>
      )}

      {/* Tamamlanma Kutlaması */}
      {onboarding.isComplete && (
        <PanelSurface className="border-emerald-400/30 bg-emerald-500/5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
              <svg
                className="h-6 w-6 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-emerald-400">
                Tebrikler! Tüm adımları tamamladınız.
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Sistemi kullanmaya hazırsınız. İyi satışlar!
              </p>
            </div>
          </div>
        </PanelSurface>
      )}

      {/* Ana Metrikler */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PanelSurface>
          <div className="text-xs text-slate-400">Toplam Ürün</div>
          <div className="mt-2 text-3xl font-bold text-slate-100">
            {stats.totalProducts}
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="text-emerald-400">{stats.publishedProducts} yayında</span>
            <span className="text-slate-500">{stats.draftProducts} taslak</span>
            <span className="text-indigo-400">{stats.readyProducts} hazır</span>
            <span className="text-amber-400">{stats.unpublishedProducts} yayından kaldırılmış</span>
          </div>
        </PanelSurface>

        <PanelSurface>
          <div className="text-xs text-slate-400">Toplam Stok Değeri</div>
          <div className="mt-2 text-3xl font-bold text-slate-100">
            ₺{stats.totalValue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {stats.totalStock.toLocaleString("tr-TR")} adet stok
          </div>
        </PanelSurface>

        <PanelSurface>
          <div className="text-xs text-slate-400">Ortalama Sağlık Skoru</div>
          <div className="mt-2 flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white ${getHealthScoreColor(stats.averageHealthScore)}`}
            >
              {stats.averageHealthScore}
            </div>
            <div className="text-sm text-slate-400">/ 100</div>
          </div>
        </PanelSurface>

        <PanelSurface>
          <div className="text-xs text-slate-400">Dikkat Gerektiren</div>
          <div className="mt-2 space-y-1">
            {stats.zeroPrice > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-red-400">Fiyatı 0</span>
                <span className="font-medium text-red-400">{stats.zeroPrice}</span>
              </div>
            )}
            {stats.zeroStock > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-amber-400">Stoğu 0</span>
                <span className="font-medium text-amber-400">{stats.zeroStock}</span>
              </div>
            )}
            {stats.missingSeo > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Eksik SEO</span>
                <span className="font-medium text-slate-300">{stats.missingSeo}</span>
              </div>
            )}
            {stats.zeroPrice === 0 && stats.zeroStock === 0 && stats.missingSeo === 0 && (
              <div className="text-sm text-emerald-400">Tüm ürünler iyi durumda!</div>
            )}
          </div>
        </PanelSurface>
      </div>

      {/* Hızlı İşlemler */}
      <PanelSurface>
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2 mb-4">
          Hızlı İşlemler
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/ai-product"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI Ürün Oluştur
          </Link>
          <Link
            href="/products/import"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            CSV İçe Aktar
          </Link>
          <Link
            href="/products/health"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Sağlık Kontrolü
          </Link>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-600 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-900/30"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Trendyol Export
          </Link>
        </div>
      </PanelSurface>

      {/* Demo Veri Yönetimi */}
      <PanelSurface className="border-violet-400/30">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Demo Veri Yönetimi
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Sistemi test etmek için örnek ürünler yükleyebilirsiniz.
            </p>
          </div>
          {demoProductCount > 0 && (
            <span className="rounded-full bg-purple-500/20 px-2 py-1 text-xs text-purple-400">
              {demoProductCount} demo ürün
            </span>
          )}
        </div>
        <DemoDataButtons
          hasDemoProducts={demoProductCount > 0}
          demoProductCount={demoProductCount}
        />
      </PanelSurface>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* En Sorunlu Ürünler */}
        <PanelSurface>
          <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-4">
            <h2 className="text-sm font-semibold text-slate-100">
              En Sorunlu Ürünler
            </h2>
            <Link
              href="/products/health"
              className="text-xs text-indigo-400 hover:underline"
            >
              Tümünü gör
            </Link>
          </div>

          {problematicProducts.length === 0 ? (
            <EmptyState
              title="Harika! Kritik ürün sorunu yok"
              description="Ürün sağlığı metrikleri stabil görünüyor."
            />
          ) : (
            <div className="space-y-2">
              {problematicProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-indigo-300/30 hover:bg-white/[0.05]"
                >
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${getHealthScoreColor(product.healthScore)}`}
                  >
                    {product.healthScore}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/products/${product.id}`}
                      className="text-sm font-medium text-slate-100 hover:text-indigo-400 truncate block"
                    >
                      {product.name}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${STATUS_COLORS[product.status] || STATUS_COLORS.draft}`}
                      >
                        {STATUS_LABELS[product.status] || "Taslak"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {product.issueCount} sorun
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/products/${product.id}/edit`}
                    className="text-xs text-indigo-400 hover:underline flex-shrink-0"
                  >
                    Düzenle
                  </Link>
                </div>
              ))}
            </div>
          )}
        </PanelSurface>

        {/* Son Aktiviteler */}
        <PanelSurface>
          <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-4">
            <h2 className="text-sm font-semibold text-slate-100">
              Son İşlemler
            </h2>
          </div>

          {recentActivity.length === 0 ? (
            <EmptyState
              title="Henüz aktivite kaydı yok"
              description="İlk ürün veya sipariş işlemlerinden sonra akış burada görünecek."
            />
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((log) => (
                <li
                  key={log.id}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-white/20"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-indigo-500"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{log.message}</p>
                    <p className="text-xs text-slate-500">
                      {log.createdAt.toLocaleString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelSurface>
      </div>

      {/* Durum Özeti */}
      {stats.totalProducts > 0 && (
        <PanelSurface>
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2 mb-4">
            Ürün Durumu Özeti
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{stats.publishedProducts}</div>
              <div className="text-xs text-slate-400 mt-1">Yayında</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${stats.totalProducts > 0 ? (stats.publishedProducts / stats.totalProducts) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-400">{stats.draftProducts}</div>
              <div className="text-xs text-slate-400 mt-1">Taslak Ürün</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-slate-500"
                  style={{
                    width: `${stats.totalProducts > 0 ? (stats.draftProducts / stats.totalProducts) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-400">{stats.readyProducts}</div>
              <div className="text-xs text-slate-400 mt-1">Hazır Ürün</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-indigo-500"
                  style={{
                    width: `${stats.totalProducts > 0 ? (stats.readyProducts / stats.totalProducts) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-400">
                {stats.totalProducts - stats.zeroPrice - stats.zeroStock}
              </div>
              <div className="text-xs text-slate-400 mt-1">Satışa Hazır</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-indigo-500"
                  style={{
                    width: `${stats.totalProducts > 0 ? ((stats.totalProducts - stats.zeroPrice - stats.zeroStock) / stats.totalProducts) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
          </div>
        </PanelSurface>
      )}
    </div>
  );
}
