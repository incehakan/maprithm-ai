import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { normalizeImageUrls } from "@/lib/productImages";
import { requireActiveStore } from "@/lib/requireActiveStore";

function resolveLifecycleStatus(status?: string | null): string {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "active") return "published";
  if (normalized === "passive") return "unpublished";
  if (normalized === "ready") return "ready";
  if (normalized === "published") return "published";
  if (normalized === "unpublished") return "unpublished";
  if (normalized === "archived") return "archived";
  return "draft";
}

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { userId: ctx.userId, storeId: ctx.storeId },
    orderBy: { createdAt: "desc" }
  });

  const mapped = products.map((p) => {
    const row = p as Record<string, unknown>;
    return {
      id: p.id,
      userId: p.userId,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      stock: p.stock,
      lifecycleStatus: (p as any).lifecycleStatus ?? resolveLifecycleStatus(p.status),
      createdAt: p.createdAt.toISOString(),
      lastXmlSyncAt: (row.lastXmlSyncAt as Date | null)?.toISOString?.() ?? null,
      lastMarketplaceSyncAt: (row.lastMarketplaceSyncAt as Date | null)?.toISOString?.() ?? null,
      marketplaceSyncStatus: (row.marketplaceSyncStatus as string | null) ?? null,
      marketplaceSyncError: (row.marketplaceSyncError as string | null) ?? null,
      marketplaceSyncSource: (row.marketplaceSyncSource as string | null) ?? null
    };
  });

  return NextResponse.json(mapped);
}

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const userExists = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true }
  });

  if (!userExists) {
    return NextResponse.json(
      { error: "Oturum geçersiz. Lütfen çıkış yapıp tekrar giriş yapın." },
      { status: 401 }
    );
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
      seoDescription,
      tags,
      mainImageUrl,
      imageUrls
    } = await request.json();

    const normalizedImageUrls = normalizeImageUrls([mainImageUrl ?? null, imageUrls ?? null]);
    const normalizedMainImageUrl = normalizedImageUrls[0] ?? null;

    const product = await prisma.product.create({
      data: {
        userId: ctx.userId,
        storeId: ctx.storeId,
        name,
        description: description || null,
        price: price ?? 0,
        stock: stock ?? 0,
        category: category || null,
        brand: brand || null,
        sku: sku || null,
        status: status || "draft",
        lifecycleStatus: resolveLifecycleStatus(status),
        seoDescription: seoDescription || null,
        tags: tags || null,
        mainImageUrl: normalizedMainImageUrl,
        imageUrls:
          normalizedImageUrls.length > 0
            ? normalizedImageUrls
            : Prisma.JsonNull
      }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "product_create",
      entityType: "product",
      entityId: product.id,
      message: `Ürün oluşturuldu: ${product.name}`
    });

    return NextResponse.json(
      {
        id: product.id,
        userId: product.userId,
        name: product.name,
        description: product.description,
        price: Number(product.price),
        stock: product.stock,
        createdAt: product.createdAt.toISOString()
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Ürün oluşturulurken hata." },
      { status: 500 }
    );
  }
}

