import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EditProductForm from "./product-form";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

async function getProduct(id: string, userId: string, storeId: string) {
  const product = await prisma.product.findFirst({
    where: { id, userId, storeId }
  });

  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    price: Number(product.price),
    stock: product.stock,
    status: (product as any).lifecycleStatus ?? product.status,
    seoDescription: product.seoDescription,
    category: product.category,
    brand: product.brand,
    sku: product.sku,
    tags: product.tags
  };
}

export default async function EditProductPage({
  params
}: {
  params: { id: string };
}) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_STORE") {
      redirect("/register-store");
    }
    notFound();
  }

  try {
    requirePermission(ctx, "products.update");
  } catch {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-slate-200">
        <p className="font-medium">Bu sayfaya erişim yetkiniz yok</p>
        <p className="mt-1 text-sm text-slate-400">
          Gerekli izin: <code className="text-slate-300">products.update</code>
        </p>
      </div>
    );
  }

  const product = await getProduct(params.id, ctx.userId, ctx.storeId);
  if (!product) {
    notFound();
  }

  return <EditProductForm product={product} />;
}

