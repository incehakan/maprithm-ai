import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductDetailClient } from "@/components/products/ProductDetailClient";
import { getUserSettings } from "@/lib/userSettings";
import { getProductDisplayStatus } from "@/lib/productDisplayStatus";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

async function getProduct(id: string, userId: string, storeId: string) {
  const product = await prisma.product.findFirst({
    where: { id, userId, storeId },
    include: {
      marketplaceMappings: {
        where: { platform: "trendyol" },
        select: { publishStatus: true },
        take: 1
      }
    }
  });

  if (!product) return null;

  const p = product as any;

  const mappingPublishStatus = product.marketplaceMappings[0]?.publishStatus ?? null;
  const displayStatus = getProductDisplayStatus(
    { stock: product.stock, lifecycleStatus: (product as any).lifecycleStatus ?? "draft" },
    { publishStatus: mappingPublishStatus }
  );

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: Number(product.price),
    stock: product.stock,
    category: product.category,
    brand: product.brand,
    sku: product.sku,
    status: product.status,
    lifecycleStatus: (product as any).lifecycleStatus ?? "draft",
    displayStatus,
    mappingPublishStatus,
    archivedAt: (product as any).archivedAt?.toISOString?.() ?? null,
    publishedAt: (product as any).publishedAt?.toISOString?.() ?? null,
    unpublishedAt: (product as any).unpublishedAt?.toISOString?.() ?? null,
    mainImageUrl: (product as any).mainImageUrl ?? null,
    imageUrls: (product as any).imageUrls ?? null,
    seoDescription: product.seoDescription,
    tags: product.tags,
    createdAt: product.createdAt.toISOString(),
    costPrice: p.costPrice ?? null,
    commissionRate: p.commissionRate ?? null,
    cargoCost: p.cargoCost ?? null,
    vatRate: p.vatRate ?? null,
    targetProfitRate: p.targetProfitRate ?? null
  };
}

async function getProductActivityLogs(productId: string, userId: string, storeId: string) {
  const anyPrisma = prisma as any;

  if (
    !anyPrisma.activityLog ||
    typeof anyPrisma.activityLog.findMany !== "function"
  ) {
    return [];
  }

  const logs = await anyPrisma.activityLog.findMany({
    where: {
      userId,
      storeId,
      entityType: "product",
      entityId: productId
    },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return logs.map((log: any) => ({
    id: log.id,
    action: log.action,
    message: log.message,
    createdAt:
      log.createdAt instanceof Date
        ? log.createdAt.toISOString()
        : String(log.createdAt)
  }));
}

export default async function ProductDetailPage({
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
  const product = await getProduct(params.id, userId, storeId);

  if (!product) {
    notFound();
  }

  const [activityLogs, userSettings] = await Promise.all([
    getProductActivityLogs(params.id, userId, storeId),
    getUserSettings({ userId, storeId })
  ]);

  return (
    <ProductDetailClient
      product={product}
      activityLogs={activityLogs}
      defaultSettings={{
        commissionRate: userSettings.defaultCommissionRate,
        cargoCost: userSettings.defaultCargoCost,
        vatRate: userSettings.defaultVatRate,
        targetProfitRate: userSettings.defaultTargetProfitRate
      }}
    />
  );
}
