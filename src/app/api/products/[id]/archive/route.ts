import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createActivityLog } from "@/lib/activityLog";
import {
  canArchiveProduct,
  getProductLifecycleStatus
} from "@/lib/productLifecycle";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const anyPrisma = prisma as any;

  const product = await prisma.product.findFirst({
    where: { id: params.id, userId }
  });
  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
  }

  const mapping = await anyPrisma.productMarketplaceMapping?.findUnique?.({
    where: { productId_platform: { productId: params.id, platform: "trendyol" } }
  });

  const lifecycle = getProductLifecycleStatus(product as any, mapping as any);
  if (lifecycle === "published") {
    return NextResponse.json(
      { error: "Ürün yayındaysa önce yayından kaldırılmalıdır" },
      { status: 400 }
    );
  }

  if (!canArchiveProduct(product as any, mapping as any)) {
    return NextResponse.json(
      { error: "Ürün mevcut durumda arşivlenemez." },
      { status: 400 }
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: params.id },
      data: {
        lifecycleStatus: "archived",
        archivedAt: now
      }
    });

    if ((tx as any).productMarketplaceMapping && mapping) {
      await (tx as any).productMarketplaceMapping.update({
        where: { id: mapping.id },
        data: {
          publishStatus: "archived",
          archivedAt: now,
          lastSyncAt: now
        }
      });
    }
  });

  await createActivityLog({
    userId,
    action: "PRODUCT_ARCHIVED",
    entityType: "product",
    entityId: params.id,
    message: "Ürün arşivlendi."
  });

  return NextResponse.json({ success: true, lifecycleStatus: "archived" });
}
