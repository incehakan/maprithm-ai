import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";

function formatDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("tr-TR");
}

export default async function StorePage() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    redirect("/login");
  }

  const [store, stats, members] = await Promise.all([
    prisma.store.findUnique({
      where: { id: ctx.storeId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        plan: true,
        timezone: true,
        currency: true,
        locale: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    Promise.all([
      prisma.product.count({ where: { storeId: ctx.storeId } }),
      prisma.importJob.count({ where: { storeId: ctx.storeId, usageStatus: { not: "deleted" } } }),
      prisma.xmlFeedSource.count({ where: { storeId: ctx.storeId } })
    ]),
    prisma.storeMembership.findMany({
      where: { storeId: ctx.storeId },
      select: { id: true, isActive: true }
    })
  ]);

  if (!store) {
    return (
      <div className="card">
        <div className="text-sm text-red-300">Mağaza bulunamadı.</div>
      </div>
    );
  }

  const [totalProducts, totalImports, totalXmlFeeds] = stats;
  const totalUsers = members.length;
  const activeUsers = members.filter((m) => m.isActive).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mağaza</h1>
        <p className="mt-1 text-sm text-slate-400">
          Aktif mağaza bilgileri ve özet metrikler.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="text-sm font-semibold text-slate-100">Mağaza Bilgileri</div>
          <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-400">Ad</dt>
              <dd className="text-slate-100">{store.name}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Slug</dt>
              <dd className="text-slate-100">{store.slug}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Durum</dt>
              <dd className="text-slate-100">{store.status}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Plan</dt>
              <dd className="text-slate-100">{store.plan ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Timezone</dt>
              <dd className="text-slate-100">{store.timezone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Currency</dt>
              <dd className="text-slate-100">{store.currency}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Locale</dt>
              <dd className="text-slate-100">{store.locale}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Güncelleme</dt>
              <dd className="text-slate-100">{formatDate(store.updatedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card">
              <div className="text-xs text-slate-400">Toplam kullanıcı</div>
              <div className="mt-1 text-2xl font-semibold">{totalUsers}</div>
            </div>
            <div className="card">
              <div className="text-xs text-slate-400">Aktif kullanıcı</div>
              <div className="mt-1 text-2xl font-semibold">{activeUsers}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card">
              <div className="text-xs text-slate-400">Ürün</div>
              <div className="mt-1 text-2xl font-semibold">{totalProducts}</div>
            </div>
            <div className="card">
              <div className="text-xs text-slate-400">Import</div>
              <div className="mt-1 text-2xl font-semibold">{totalImports}</div>
            </div>
            <div className="card">
              <div className="text-xs text-slate-400">XML Feed</div>
              <div className="mt-1 text-2xl font-semibold">{totalXmlFeeds}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

