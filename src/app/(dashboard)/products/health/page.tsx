import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ProductHealthClient } from "@/components/products/ProductHealthClient";
import { createActivityLog } from "@/lib/activityLog";
import {
  checkProductHealth,
  calculateHealthSummary,
  type ProductForHealth
} from "@/lib/productHealth";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

async function getProductsForHealth(
  userId: string,
  storeId: string
): Promise<ProductForHealth[]> {
  const products = await prisma.product.findMany({
    where: { userId, storeId },
    orderBy: { createdAt: "desc" }
  });

  return products.map((p) => ({
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
    status: p.status
  }));
}

export default async function ProductHealthPage() {
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

  const products = await getProductsForHealth(ctx.userId, ctx.storeId);

  const healthResults = products.map((p) => checkProductHealth(p));
  const summary = calculateHealthSummary(products, healthResults);

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "products_health_viewed",
    entityType: "product_health",
    entityId: null,
    message: `Ürün sağlık ekranı görüntülendi (${summary.totalProducts} ürün, ortalama skor: ${summary.averageHealthScore})`
  });

  return (
    <ProductHealthClient healthResults={healthResults} summary={summary} />
  );
}
