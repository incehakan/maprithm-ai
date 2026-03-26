import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductsTable } from "@/components/products/ProductsTable";
import { ProductsPageToolbar } from "@/components/products/ProductsPageToolbar";
import { getProductDisplayStatus } from "@/lib/productDisplayStatus";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

type FilterStatus = "active" | "published" | "out_of_stock" | "archived";

async function getProducts(
  userId: string,
  storeId: string,
  status: FilterStatus
) {
  const where =
    status === "archived"
      ? {
          userId,
          storeId,
          OR: [
            { lifecycleStatus: "archived" },
            {
              marketplaceMappings: {
                some: { platform: "trendyol", publishStatus: "archived" }
              }
            }
          ]
        }
      : status === "published"
        ? {
            userId,
            storeId,
            lifecycleStatus: { notIn: ["archived", "deleted"] },
            marketplaceMappings: {
              some: { platform: "trendyol", publishStatus: "published" }
            }
          }
      : status === "out_of_stock"
        ? {
            userId,
            storeId,
            stock: 0,
            lifecycleStatus: { in: ["published", "ready"] },
            marketplaceMappings: {
              some: { platform: "trendyol", publishStatus: "published" }
            }
          }
        : {
            userId,
            storeId,
            stock: { gt: 0 },
            lifecycleStatus: { notIn: ["archived", "deleted"] }
          };

  const products = await prisma.product.findMany({
    where: where as any,
    include: {
      marketplaceMappings: {
        where: { platform: "trendyol" },
        select: { publishStatus: true },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    stock: p.stock,
    lifecycleStatus: (p as any).lifecycleStatus ?? "draft",
    mappingPublishStatus: p.marketplaceMappings[0]?.publishStatus ?? null,
    displayStatus: getProductDisplayStatus(
      { stock: p.stock, lifecycleStatus: (p as any).lifecycleStatus ?? "draft" },
      { publishStatus: p.marketplaceMappings[0]?.publishStatus ?? null }
    ),
    createdAt: p.createdAt.toISOString()
  }));
}

export default async function ProductsPage({
  searchParams
}: {
  searchParams?: { status?: string };
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
    requirePermission(ctx, "products.view");
  } catch {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-slate-200">
        <p className="font-medium">Bu sayfaya erişim yetkiniz yok</p>
        <p className="mt-1 text-sm text-slate-400">
          Gerekli izin: <code className="text-slate-300">products.view</code>
        </p>
      </div>
    );
  }

  const userId = ctx.userId;
  const storeId = ctx.storeId;

  const status = (searchParams?.status ?? "active").toLowerCase() as FilterStatus;
  const currentStatus: FilterStatus = [
    "active",
    "published",
    "out_of_stock",
    "archived"
  ].includes(status)
    ? status
    : "active";

  const products = await getProducts(userId, storeId, currentStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ürünler</h1>
          <p className="text-sm text-slate-400">
            Ürün kataloğunuzu ve stoklarınızı yönetin.
          </p>
        </div>
        <ProductsPageToolbar />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/products?status=active" className="inline-flex rounded-md border border-emerald-700 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30">Aktif Ürünler</Link>
        <Link href="/products?status=published" className="inline-flex rounded-md border border-indigo-700 px-3 py-1 text-xs text-indigo-300 hover:bg-indigo-900/30">Yayındakiler</Link>
        <Link href="/products?status=out_of_stock" className="inline-flex rounded-md border border-amber-700 px-3 py-1 text-xs text-amber-300 hover:bg-amber-900/30">Tükenenler</Link>
        <Link href="/products?status=archived" className="inline-flex rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-900/40">Arşivdekiler</Link>
      </div>

      <ProductsTable products={products} />
    </div>
  );
}

