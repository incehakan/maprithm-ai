import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { logStoreScopeSecurity } from "@/lib/security/storeScope";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const product = await prisma.product.findFirst({
    where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
  });
  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
  }

  const mapping = await prisma.productMarketplaceMapping.findFirst({
    where: {
      productId: params.id,
      platform: "trendyol",
      storeId: ctx.storeId
    }
  });

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const pu = await tx.product.updateMany({
        where: { id: params.id, storeId: ctx.storeId },
        data: {
          lifecycleStatus: "ready",
          archivedAt: null
        }
      });
      if (pu.count === 0) {
        logStoreScopeSecurity({
          event: "STORE_SCOPED_ENTITY_NOT_FOUND",
          userId: ctx.userId,
          storeId: ctx.storeId,
          targetEntity: "Product",
          targetId: params.id,
          route: "POST /api/products/[id]/restore-ready",
          action: "product.updateMany"
        });
        throw new Error("STORE_SCOPED_UPDATE_FAILED");
      }

      if (mapping) {
        await tx.productMarketplaceMapping.updateMany({
          where: { id: mapping.id, storeId: ctx.storeId },
          data: {
            publishStatus: "ready",
            archivedAt: null,
            lastSyncAt: now
          }
        });
      }
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "STORE_SCOPED_UPDATE_FAILED") {
      return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
    }
    throw e;
  }

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "PRODUCT_RESTORED",
    entityType: "product",
    entityId: params.id,
    message: "Ürün yeniden yayına hazır duruma alındı."
  });

  return NextResponse.json({ success: true, lifecycleStatus: "ready" });
}
