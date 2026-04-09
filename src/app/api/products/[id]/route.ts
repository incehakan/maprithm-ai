import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { normalizeImageUrls } from "@/lib/productImages";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

function resolveLifecycleStatus(status?: string | null): string {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "active") return "published";
  if (normalized === "passive") return "unpublished";
  if (normalized === "ready") return "ready";
  if (normalized === "published") return "published";
  if (normalized === "unpublished") return "unpublished";
  if (normalized === "archived") return "archived";
  if (normalized === "draft") return "draft";
  return "draft";
}

export async function GET(_req: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "products.view");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const product = await prisma.product.findFirst({
    where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
  });

  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
  }

  const p = product as Record<string, unknown>;
  const mapping = await prisma.productMarketplaceMapping.findFirst({
    where: { productId: params.id, storeId: ctx.storeId, platform: "trendyol" },
    select: { id: true }
  });

  return NextResponse.json({
    id: product.id,
    userId: product.userId,
    name: product.name,
    description: product.description,
    price: Number(product.price),
    stock: product.stock,
    mainImageUrl: (product as any).mainImageUrl ?? null,
    imageUrls: (product as any).imageUrls ?? null,
    lifecycleStatus:
      (product as any).lifecycleStatus ?? resolveLifecycleStatus(product.status),
    createdAt: product.createdAt.toISOString(),
    hasTrendyolMapping: Boolean(mapping),
    lastXmlSyncAt: (p.lastXmlSyncAt as Date | null)?.toISOString?.() ?? null,
    lastMarketplaceSyncAt: (p.lastMarketplaceSyncAt as Date | null)?.toISOString?.() ?? null,
    marketplaceSyncStatus: (p.marketplaceSyncStatus as string | null) ?? null,
    marketplaceSyncError: (p.marketplaceSyncError as string | null) ?? null,
    marketplaceSyncSource: (p.marketplaceSyncSource as string | null) ?? null
  });
}

export async function PATCH(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "products.update");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  try {
    const {
      name,
      description,
      price,
      stock,
      category,
      brand,
      sku,
      status,
      lifecycleStatus,
      seoDescription,
      tags,
      mainImageUrl,
      imageUrls
    } = await request.json();

    const normalizedImageUrls = normalizeImageUrls([mainImageUrl ?? null, imageUrls ?? null]);
    const normalizedMainImageUrl = normalizedImageUrls[0] ?? null;

    const nextLifecycle =
      typeof lifecycleStatus === "string" && lifecycleStatus.trim()
        ? lifecycleStatus.trim().toLowerCase()
        : resolveLifecycleStatus(typeof status === "string" ? status : null);

    const updated = await prisma.product.updateMany({
      where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId },
      data: {
        name,
        description,
        price,
        stock,
        category: category ?? null,
        brand: brand ?? null,
        sku: sku ?? null,
        status: status ?? "draft",
        lifecycleStatus: nextLifecycle,
        seoDescription: seoDescription ?? null,
        tags: tags ?? null,
        mainImageUrl: normalizedMainImageUrl,
        imageUrls:
          normalizedImageUrls.length > 0
            ? normalizedImageUrls
            : Prisma.JsonNull
      }
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
    }

    // Ana ürün fiyatı güncellendiğinde Trendyol tarafında varsayılan olarak
    // ana ürün fiyatının kullanılmasını garanti et.
    if (typeof price === "number" && Number.isFinite(price)) {
      const anyPrisma = prisma as any;
      if (anyPrisma.productMarketplaceMapping) {
        await anyPrisma.productMarketplaceMapping.updateMany({
          where: {
            productId: params.id,
            userId: ctx.userId,
            storeId: ctx.storeId,
            platform: "trendyol"
          },
          data: { useProductPrice: true, storeId: ctx.storeId }
        });
      }
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "product_update",
      entityType: "product",
      entityId: params.id,
      message: `Ürün güncellendi: ${name}`
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Ürün güncellenirken hata." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "products.archive");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  try {
    const existing = await prisma.product.findFirst({
      where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId },
      select: { id: true, name: true }
    });

    const now = new Date();
    const archived = await prisma.product.updateMany({
      where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId },
      data: {
        lifecycleStatus: "archived",
        archivedAt: now
      }
    });

    if (archived.count === 0) {
      return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
    }

    const anyPrisma = prisma as any;
    if (anyPrisma.productMarketplaceMapping) {
      await anyPrisma.productMarketplaceMapping.updateMany({
        where: {
          productId: params.id,
          userId: ctx.userId,
          storeId: ctx.storeId,
          platform: "trendyol"
        },
        data: {
          storeId: ctx.storeId,
          publishStatus: "archived",
          archivedAt: now,
          lastSyncAt: now
        }
      });
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "PRODUCT_ARCHIVED",
      entityType: "product",
      entityId: params.id,
      message: `Ürün arşivlendi: ${existing?.name ?? params.id}`
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Ürün silinirken hata." },
      { status: 500 }
    );
  }
}

